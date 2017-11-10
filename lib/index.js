const http = require("http");
const path = require("path");
const fs = require("fs");
const AWS = require("aws-sdk");
const debug = require("debug")("webdav-s3");

const bucket = "asana-sandbox-bazel-cache";

const StatusCode = {
    OK: 200,
    Forbidden: 403,
    NotFound: 404,
    InternalServerError: 500
};

const hostname = "localhost";
const port = 3001;

// The entire cache (in memory). The key is a URL's path; the value is the data (as a Buffer).
const cache = {};

function logProps(req, res) {
    debug(req.method, req.url, res.statusCode);
}

function logFailure(httpRequest, s3error) {
    debug(`${httpRequest.method} ${httpRequest.url}: ${s3error.message || s3error.code}`);
}

function endResponse(req, res, endArg) {
    logProps(req, res);
    res.end.apply(res, endArg ? [endArg] : []);
}

function startServer(s3) {
    const server = http.createServer((req, res) => {
        const s3key = req.url.slice(1); // remove leading "/"

        switch (req.method) {
            case "GET": {
                const s3request = s3.getObject({
                     Bucket: bucket,
                     Key: s3key
                }).promise();

                s3request
                    .then(data => endResponse(req, res, data.Body))
                    .catch(err => {
                        logFailure(req, err);
                        res.statusCode = err.statusCode || StatusCode.NotFound;
                        endResponse(req, res);
                    });
                break;
            }

            case "PUT": {
                if (req.url === "/") {
                    res.statusCode = StatusCode.Forbidden;
                    endResponse(req, res);
                } else {
                    let body = [];
                    req.on("data", chunk => {
                        body.push(chunk);
                    });
                    req.on("end", () => {
                        const s3request = s3.putObject({
                            Bucket: bucket,
                            Key: s3key,
                            Body: Buffer.concat(body),
                            // The bucket owner needs full control of the uploaded
                            // object, so that they can share the object with all
                            // the appropriate users
                            ACL: "bucket-owner-full-control"
                        }).promise();
                        s3request
                            .then(() => endResponse(req, res))
                            .catch(err => {
                                logFailure(req, err);
                                res.statusCode = err.statusCode || StatusCode.NotFound;
                                endResponse(req, res);
                            });
                    });
                }
                break;
            }

            case "HEAD": {
                const s3request = s3.headObject({
                     Bucket: bucket,
                     Key: s3key
                }).promise();

                s3request
                    .then(data => endResponse(req, res))
                    .catch(err => {
                        logFailure(req, err);
                        debug(err);
                        res.statusCode = err.statusCode || StatusCode.NotFound;
                        endResponse(req, res);
                    });
                break;
            }

            // Bazel does not use this, but we support it.
            case "DELETE": {
                const s3request = s3.deleteObject({
                     Bucket: bucket,
                     Key: s3key
                }).promise();

                s3request
                    .then(data => endResponse(req, res))
                    .catch(err => {
                        debug(`DELETE ${req.url}: ${err.message}`);
                        res.statusCode = err.statusCode || StatusCode.NotFound;
                        endResponse(req, res);
                    });
                break;
            }

            default: {
                res.statusCode = StatusCode.InternalServerError;
                endResponse(req, res);
            }
        }
    });

    server.listen(port, hostname, () => {
        console.log(`Server running at http://${hostname}:${port}/`);
    });
}

const chain = new AWS.CredentialProviderChain();
chain.resolvePromise()
    .then(credentials => {
        AWS.config.credentials = credentials;
        const s3 = new AWS.S3({
            apiVersion: '2006-03-01',
            credentials: credentials
        });
        startServer(s3);
    })
    .catch(err => {
        debug(`Could not resolve AWS credentials: ${err.message}`);
    });

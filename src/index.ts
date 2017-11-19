import * as http from "http";
import * as AWS from "aws-sdk";
import * as debug_ from "debug";
import * as minimist from "minimist";
import * as winston from "winston";
import { Args, Config, getConfig, validateConfig } from "./config";
import { Cache } from "./memorycache";
import { debug } from "./debug";
import { startServer } from "./server";
import { initLogging } from "./logging";

function main(args: Args) {
    const config = getConfig(args);
    initLogging(config); // Do this early, because when logging doesn't work, we're flying blind

    const configErrorMessage = validateConfig(config);
    if (configErrorMessage) {
        console.error(`bazels3cache: ${configErrorMessage}`);
        winston.error(configErrorMessage);
        process.exitCode = 1;
        return;
    }

    process.on('uncaughtException', function (err) {
        console.error("bazels3cache: Uncaught exception:", err);
        winston.error(`bazels3cache: Uncaught exception: ${err}`);
        process.exit(1); // hard stop
    });

    const chain = new AWS.CredentialProviderChain(null);
    chain.resolvePromise()
        .then(credentials => {
            AWS.config.credentials = credentials;
            const s3 = new AWS.S3({
                apiVersion: "2006-03-01",
                credentials: credentials
            });
            startServer(s3, config);
        })
        .catch((err: AWS.AWSError) => {
            const message = `Could not resolve AWS credentials: ${err.message}`;
            console.error(`bazels3cache: ${message}`);
            winston.error(message);
            process.exitCode = 1;
        });
}

main(minimist<Args>(process.argv.slice(2)));

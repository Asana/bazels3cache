import * as AWS from "aws-sdk";
import * as debug_ from "debug";
import * as minimist from "minimist";
import * as winston from "winston";
import { Args, Config, getConfig, validateConfig } from "./config";
import { startServer } from "./server";

const debug = debug_("bazels3cache");

function initLogging(config: Config) {
    winston.configure({
        level: config.logging.level,
        transports: [
            new winston.transports.File({
                filename: config.logging.file,
                json: false
            })
        ],
        padLevels: true
    });
}

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

    winston.info("starting");
    process.on("exit", exitCode => winston.info(`terminating with exit code ${exitCode}`));
    process.on("uncaughtException", err => {
        console.error("bazels3cache: Uncaught exception:", err);
        winston.error(`bazels3cache: Uncaught exception: ${err}`);
        process.exit(1); // hard stop
    });

    const chain = new AWS.CredentialProviderChain(null);
    chain
        .resolvePromise()
        .then(credentials => {
            AWS.config.credentials = credentials;
            const s3 = new AWS.S3({
                apiVersion: "2006-03-01",
                credentials
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

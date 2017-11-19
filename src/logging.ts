import * as fs from "fs";
import * as winston from "winston";
import { Config } from "./config";

// We want the log file to be world-writable, to deal with the case where one user ran bazels3cache,
// and then later a different ran it. (This is a temporary hack; really we need to improve the way
// we do logging rather than just opening a file in /tmp with the permissions of some arbitrary
// user.)
function ensureLogFileWorldWritable(config: Config) {
    const logfile = fs.openSync(config.logging.file, "a");
    fs.closeSync(logfile);
    const stat = fs.statSync(config.logging.file);
    try {
        fs.chmodSync(config.logging.file, stat.mode | 0o666);
    } catch (err) {
        // ignore
    }
}

export function initLogging(config: Config) {
    ensureLogFileWorldWritable(config);

    winston.configure({
        level: config.logging.level,
        transports: [
            new (winston.transports.File)({
                filename: config.logging.file,
                json: false
            })
        ],
        padLevels: true,
    });

    winston.info("starting");

    process.on("exit", (exitCode) => winston.info(`terminating with exit code ${exitCode}`));
}

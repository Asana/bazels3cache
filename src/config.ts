import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import * as commentJson from "comment-json";
import * as VError from "verror";

// Command line arguments
export interface Args {
    config?: string; // "--config=myconfig.json"

    // Other keys are allowed to mirror values from `Config` below. E.g.
    // --port=123 --bucket=foo
    [key: string]: string | number | boolean;
}

// Fields that we recognize from ../config.default.json, any user-specified
// config file (e.g. --config=myconfig.json), and any command-line arguments
// (e.g. --cache.maxEntrySizeBytes=1234)
export interface Config {
    host?: string;
    port?: number;
    idleMinutes?: number;
    bucket?: string;
    allowOffline?: boolean;
    errorsBeforePausing?: number;
    pauseMinutes?: number;
    socketTimeoutSeconds?: number;
    maxEntrySizeBytes?: number;
    allowGccDepfiles?: boolean;
    s3Prefix?: string;
    asyncUpload?: {
        enabled?: boolean;
        maxPendingUploadMB?: number;
        cacheDir?: string;
    }

    cache?: {
        enabled: boolean;
        maxEntrySizeBytes: number;
        maxTotalSizeBytes: number;
    }

    logging?: {
        level?: string;
        file?: string;
    }
}

// Merges zero or more JSON objects.
// Not type-safe, alas. And not fancy ES6, alas.
// There is no good way to use the "..." (spread) operator here,
// because we don't want to clobber entire sub-objects.For example,
// Suppose sources[0] is:
//
//     {
//         "port": 1234,
//         ...,
//         "cache": {
//             "enabled": "false",
//             "maxEntrySizeBytes": 1000000,
//             "maxTotalSizeBytes": 50000000
//         },
//     }
//
// And we want to only override maxEntrySizeBytes, nothing else,
// with this:
//
//     {
//         "cache": {
//             "maxEntrySizeBytes": 1000
//         }
//     }
//
// The spread operator would clobber the entire "cache" object, thus
// deleting cache.enabled and cache.maxTotalSizeBytes.
function merge(...sources: any[]) {
    const target: any = {};
    sources.forEach(source => {
        Object.keys(source).forEach(key => {
            let value = source[key];
            if (typeof value === "object" && value !== null) {
                target[key] = merge(target[key] || {}, value);
            } else {
                if (value === "true") value = true;
                if (value === "false") value = false;
                target[key] = value;
            }
        })
    })
    return target;
}

function readConfigFile(pth: string): Config {
    const configJsonText = fs.readFileSync(pth, "utf8");
    try {
        return <Config> commentJson.parse(configJsonText);
    } catch (e) {
        throw new VError(e, `Error reading configuration file ${pth}`);
    }
}

function ensureInteger(name: string, value: any): number {
    if (typeof value === "string") {
        if (!value.match(/^[0-9]+$/)) {
            throw `Expected '${name}' to be an integer; got '${value}'`;
        }
        value = parseInt(value);
    }

    if (typeof value === "number") {
        if (Math.floor(value) !== value) {
            throw `Expected '${name}' to be an integer; got '${value}'`;
        }
    } else {
        throw `Expected '${name}' to be an integer; got '${value}'`;
    }

    return value;
}

// When this function is called, logging has not yet been set up (because
// the logging depends on the configuration). So don't make any winston
// logging calls from here.
export function getConfig(args: Args): Config {
    const defaultConfig = readConfigFile(path.join(__dirname, "../config.default.json"));

    const userConfigPath = path.join(process.env.HOME, ".config/bazels3cache/config.json");
    const userConfig: Config = fs.existsSync(userConfigPath)
        ? readConfigFile(userConfigPath)
        : {};

    const commandLineConfig: Config = (args.config)
        ? readConfigFile(args.config)
        : {};

    // Merge the different configs in order -- the later ones override the earlier ones:
    const mergedConfig: Config = merge(
        defaultConfig,      // .../config.default.json
        userConfig,         // ~/.config/bazels3cache/config.json
        commandLineConfig,  // --config myconfig.json
        args                // rest of command line, e.g. --port 1234
    );

    mergedConfig.asyncUpload.cacheDir = mergedConfig.asyncUpload.cacheDir.replace(/^~/, os.homedir());
    mergedConfig.logging.file = mergedConfig.logging.file.replace(/^~/, os.homedir());

    return mergedConfig;
}

// If any validation fails, returns a string which should be displayed as an error message.
// If validation succeeds, returns null.
export function validateConfig(config: Config): Config {
    if (!config.bucket) {
        throw "S3 bucket is required, e.g. 'bazels3cache --bucket=<bucketname>'";
    }

    config = merge(
        config,
        { port: ensureInteger("port", config.port) }
    );

    if (config.port < 1024 || config.port > 65535) {
        throw `Port must be in the range 1024..65535`;
    }

    if (config.cache.maxEntrySizeBytes > config.cache.maxTotalSizeBytes) {
        throw `max entry size (${config.cache.maxEntrySizeBytes}) must be <= max total size (${config.cache.maxTotalSizeBytes})`;
    }

    return config;
}

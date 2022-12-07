# [DEPRECATED] This project is no longer maintained

As of December 2022, Asana is no longer using bazels3cache internally. See [the Bazel documentation](https://bazel.build/remote/caching#cache-backend) for potential alternatives.

# Web server for proxying Bazel remote cache requests to S3.

`bazels3cache` is a simple web server that supports basic WebDAV (`GET`, `PUT`,
`HEAD`, and `DELETE`), and proxies those requests through to S3. You can use it
with `bazel --remote_http_cache=...`, so that you can use S3 for your [Bazel](https://bazel.build)
cache.

## Quick start

*   Download and install bazels3cache:

        npm install -g bazels3cache

*   Launch `bazels3cache` like this (by default it listens on port 7777):

        bazels3cache --bucket=MY_S3_BUCKET

*   When you launch Bazel, tell it where the cache is:

        bazel build --remote_http_cache=http://localhost:7777 ...

## Main features

*   Use an S3 bucket as the storage area for your Bazel remote cache.
*   Keep working (gracefully degrading to no cache) even if you are offline.
*   Asynchronous uploading to S3, to avoid slowing down your Bazel build.
*   Local in-memory cache of recently accessed data (off by default).

## Detailed description

If you want [Bazel](https://bazel.build) to use S3 as its backing store, you could really use any
WebDAV-to-S3 proxy. But the key feature of `bazels3cache` that differentiates
it from a general-purpose proxy is that if you are offline, it will report to
Bazel that "everything is fine, I just can't find the items you're looking for
in the cache." Even if Bazel tries to _upload_ something to the cache,
`bazels3cache` will pretend the upload succeeded. (This is harmless; it's just
a cache, after all.) This means that Bazel will gracefully fall back to working
locally if you go offline.

Another feature (but off by default): In-memory cache. Bazel actually uses the
cache only as [Content-addressable
storage](https://en.wikipedia.org/wiki/Content-addressable_storage) (CAS). What
this means is that the "key" (in this case, the URL) of any entry in the cache
is actually a hash of that entry's contents. Because of this, you can be
guaranteed that any cached data for a given key is definitely still valid.

`bazels3cache` takes advantage of that fact, and optionally keeps a local
(currently in-memory) cache of the data it has previously downloaded or
uploaded. This can allow for faster cache response: Sometimes it will not be
necessary to make a round-trip to S3. (This feature is OFF by default. Use
`--cache.enabled=true` to enable it.)

## Starting

`bazels3cache` will look for AWS credentials in the standard AWS-defined
places, including the
[environment](https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-environment.html)
(`AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`) and
[`~/.aws/credentials`](https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-shared.html).

## Stopping

A clean shutdown:

    curl http://localhost:7777/shutdown

Or the brute-force way:

    pkill -f bazels3cache

Also, if `idleMinutes` is greater than zero, `bazels3cache` will cleanly
terminate itself after it has received no requests for that many minutes.

## Printing debug info to the console

`bazels3cache` uses the [`debug`](https://www.npmjs.com/package/debug) Node
package, so if you want to see debugging output, run it with the `DEBUG`
environment variable:

    DEBUG=bazels3cache* bin/bazels3cache

## Offline usage

As mentioned above, it is often desirable to have Bazel continue to work even
if you are offline.  By default, if `bazels3cache` is unable to reach S3, it
will _not_ report error messages back to Bazel; it will continue to function,
passing appropriate success codes back to Bazel.

The way this works is:

*   `GET` and `HEAD`: If `bazels3cache` can find the item in its local cache,
    it will return it, along with a status code of `200 OK`; otherwise, it will
    return `404 Not Found`. Bazel will simply treat this the same as any other
    cache miss. `bazels3cache` will never report back any other errors.
*   `PUT`: `bazels3cache` will store the item in its local cache and then
    report back `200 OK`. It will never let Bazel know that it was unable to
    upload the item to S3.

To be clear: The only errors that will be ignored in this way are connectivity
errors. Other S3 errors, such as invalid key, access denied, etc., will be
passed on to Bazel as errors.

## Automatic pause of S3 access

Repeatedly attempting to access S3 while offline can be slow. So after
`bazels3cache` has gotten back three consecutive connectivity errors from S3,
it temporarily pauses all S3 access (for five minutes). During that time, only
the local in-memory cache will be used. This pause will be transparent to
Bazel.

## Asynchronous uploading to S3

When bazels3cache receives a `PUT` (an upload request) from Bazel, it needs to
upload the content to S3, and send a success/failure response back to Bazel.
There are two ways it can handle the response to Bazel:

*   If asynchronous uploading is enabled (the default), then bazels3cache
    immediately sends a success response back to Bazel, even before it has
    uploaded to S3. This allows the Bazel build to complete much more quickly.
    Of course, the upload to S3 might fail; but it's okay if Bazel doesn't know
    that.

    In this case, `bazels3cache` might even drop some uploads if it falls too
    far behind. Since the remote cache is just a cache, this is usually
    acceptable.

*   If asynchronous uploading is disabled (the `"asyncUpload"` section of
    `config.default.json`, or `--asyncUpload.enabled=false` on the command
    line), then the response code will not be sent back to Bazel until the
    upload to S3 has completed.

## Configuration

`config.default.json` shows all configurable settings, including comments
describing them, and their default values. You can override these defaults in a
couple of ways. The overrides are loaded in the order listed below -- for
example, if you have both a `~/.config/bazels3cache/config.json` file and
command-line arguments, then the command-line arguments win.

1.  A user-wide config file: `~/.config/bazels3cache/config.json`

2.  A config file specified with `--config`:

        bazels3cache --config=myconfig.json

    Your config file only needs to include the values you want to override.

3.  Command line arguments with the same names as the names from the config
    file, but with dots for nested elements. For example, the config file
    includes this:

        {
            "cache": {
                "maxEntrySizeBytes": 1000000
            }
        }

    To override this, use dashes:

        bazels3cache --cache.maxEntrySizeBytes=<NUMBER>

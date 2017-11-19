# Web server for proxying Bazel remote cache requests to S3

`bazels3cache` is a simple web server that supports basic WebDAV (`GET`, `PUT`,
`HEAD`, and `DELETE`), and proxies those requests through to S3. We use it with
`bazel --remote_rest_cache=...`, so that we can use S3 for our Bazel cache.

## I'm in a hurry, just tell me the basics!

Okay:

*   Now, when you run `bzl`, that script first runs `bazels3cache`, then Bazel.
*   `bazels3cache` listens on localhost:7777
*   You can see its log here: `/tmp/bazels3cache.log`
*   In that log, `starting` means `bazels3cache` started; `terminating with
    exit code <n>` means it terminated.
*   After 30 minutes of idle (no requests), it terminates automatically.
*   To make it terminate: `bzl shutdown` or `curl http://localhost:7777/shutdown`

## I have all day, tell me more!

If you want Bazel to use S3 as its backing store, you could really use any
WebDAV-to-S3 proxy. But the key feature of `bazels3cache` that differentiates
it from a general-purpose proxy is that if you are offline, it will report to
Bazel that "everything is fine, I just can't find the items you're looking for
in the cache." Even if Bazel tries to _upload_ something to the cache,
`bazels3cache` will pretend the upload succeeded. (This is harmless; it's just
a cache, after all.) This means that Bazel will gracefully fall back to working
locally if you go offline.

Another feature: Bazel actually uses the cache only as [Content-addressable
storage](https://en.wikipedia.org/wiki/Content-addressable_storage) (CAS). What
this means is that the "key" (in this case, the URL) of any entry in the cache
is actually a hash of that entry's contents. Because of this, you can be
guaranteed that any cached data for a given key is definitely still valid.

`bazels3cache` takes advantage of that fact, and keeps a local (currently
in-memory) cache of the data it has previously downloaded or uploaded. This can
allow for faster cache response: Sometimes it will not be necessary to make a
round-trip to S3.

## Starting

To start it, you will almost always just go through `bzl` -- this is by far the
easiest way:

    bzl build //target  # starts bazels3cache, then builds the target
    # or,
    bzl build           # starts bazels3cache, doesn't build any bazel targets

If you really want to start it manually, you will have to address a couple of
issues:

*   Where does it find AWS credentials? The program will look in the standard
    AWS-defined places, including the environment and `~/.aws/credentials`, but
    it will not look in `$CODEZ/info.yaml`.

*   What S3 bucket do you want it to use for the cache?

`bin/bazels3cache` just starts the program, with no special ability to address
the above issues. But `bin/start` is a little smarter, it will read
`$CODEZ/info.yaml` and pass its values as environment variables. You will still
have to tell it what bucket to use.

## Stopping

Clean shutdown, just go through `bzl`:

    bzl shutdown       # This also stops bazels3cache

Or, directly (this is what `bzl` actually does):

    curl http://localhost:7777/shutdown

Or the brute-force way:

    pkill -f bazels3cache

Also, `bazels3cache` will cleanly terminate itself after it has received no
requests for 30 minutes.

## Arguments for Bazel

`bazels3cache` defaults to using port 7777. Assuming you have it on the default
port, and running on `localhost, start Bazel with these arguments:

    bazel \
        --host_jvm_args=-Dbazel.DigestFunction=SHA1 \
        --remote_rest_cache=http://localhost:7777 \
        build ...

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

## Automatic pause of S3 access

Repeatedly attempting to access S3 while offline can be slow. So after
`bazels3cache` has gotten back ten consecutive error messages from S3, it
temporarily pauses all S3 access (for five minutes). During that time, only the
local in-memory cache will be used. This pause will be transparent to Bazel.

## Automatic termination

After 30 minutes of inactivity, bazels3cache terminates.

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

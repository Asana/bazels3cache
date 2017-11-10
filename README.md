# Web server for proxying Bazel remote cache requests to S3

`webdav-s3` is a simple web server that supports basic WebDAV (`GET`, `PUT`,
`HEAD`, and `DELETE`), and proxies those requests through to s3. We use it with
`bazel --remote_rest_cache=...`, so that we can use S3 for our Bazel cache.

## Launching

    ./start.sh

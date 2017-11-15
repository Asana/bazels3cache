import { startServer } from "./server";
import { getConfig } from "./config";
import { expect } from "chai";
import { URL } from "url";
import * as http from "http";

class FakeS3 {}

interface ServerResponse {
    statusCode?: number;
    data: Buffer;
}

async function makeRequest(
    options: http.ClientRequestArgs,
    body?: Buffer
): Promise<ServerResponse> {
    return new Promise<ServerResponse>((resolve, reject) => {
        const request = http.request(
            {
                method: "GET",
                ...options,
                hostname: "localhost"
            },
            res => {
                const chunks: Buffer[] = [];
                res.on("data", chunk => chunks.push(<Buffer>chunk));
                res.on("end", () => {
                    resolve({
                        statusCode: res.statusCode,
                        data: Buffer.concat(chunks)
                    });
                });
            }
        );
        if (body) {
            request.write(body);
        }
        request.end();
    });
}

describe("startServer", () => {
    it("should respond to /ping", async () => {
        const fakeS3 = new FakeS3();
        const port = 12345;
        const config = getConfig({ port });
        const server = await startServer(fakeS3 as any, config);
        const response = await makeRequest({
            hostname: "localhost",
            method: "GET",
            port: port,
            path: "/ping"
        });
        expect(response.statusCode).to.equal(200);
        expect(response.data.toString("utf8")).to.equal("pong");
        server.close();
    });

    it("should shutdown cleanly on /shutdown", async () => {
        const fakeS3 = new FakeS3();
        const port = 12346;
        const config = getConfig({ port });
        const server = await startServer(fakeS3 as any, config);
        const response = await makeRequest({
            hostname: "localhost",
            method: "GET",
            port: port,
            path: "/shutdown"
        });
        expect(response.statusCode).to.equal(200);
        expect(server.listening).to.equal(false);
    });
});

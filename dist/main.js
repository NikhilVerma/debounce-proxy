"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const https_1 = __importDefault(require("https"));
const axios_1 = __importDefault(require("axios"));
const MAX_RPS_TIME = 5000;
const DEFAULT_DEBOUNCE_TIME = 5 * 60 * 1000;
const fastify = (0, fastify_1.default)({ logger: true });
const requestMap = new Map();
fastify.all("*", (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    const query = request.query;
    // Configure time from request query with a default value
    let debounceTime = Number(query.debounceTime) || DEFAULT_DEBOUNCE_TIME;
    // Cap to maximum 5rps
    if (isNaN(debounceTime) || debounceTime < MAX_RPS_TIME) {
        debounceTime = MAX_RPS_TIME;
    }
    // Validate URL
    let parsedUrl;
    try {
        parsedUrl = new URL(query.url);
    }
    catch (error) {
        return reply.status(400).send("Invalid URL");
    }
    const { method, headers } = request.raw;
    const body = request.body;
    const key = `${method}:${parsedUrl}`;
    const now = Date.now();
    const updatedHeaders = Object.assign(Object.assign({}, headers), { Host: parsedUrl.hostname });
    const cacheEntry = requestMap.get(key);
    // Proxy request immediately
    try {
        if (cacheEntry && now - cacheEntry.timestamp < cacheEntry.debounceTime) {
            // Add estimated time to message
            const estimatedTime = Math.round((cacheEntry.debounceTime - (now - requestMap.get(key).timestamp)) / 1000);
            reply.status(202).send(`Request saved and will be processed in ${estimatedTime}s`);
        }
        else {
            const response = yield (0, axios_1.default)({
                httpsAgent: new https_1.default.Agent({
                    rejectUnauthorized: false
                }),
                method,
                url: parsedUrl.href,
                data: body,
                headers: updatedHeaders,
                validateStatus: () => true
            });
            reply.status(response.status).headers(response.headers).send(response.data);
            // Save request log
            requestMap.set(key, {
                timestamp: now,
                method,
                url: parsedUrl.href,
                body,
                headers: updatedHeaders,
                debounceTime
            });
        }
    }
    catch (error) {
        console.error(JSON.stringify(error));
        reply.status(500).send("Error proxying request");
    }
}));
// Function to periodically check and execute saved requests
setInterval(() => {
    const now = Date.now();
    requestMap.forEach(({ debounceTime, timestamp, method, url, headers, body }, key) => {
        if (now - timestamp >= debounceTime) {
            // Execute saved request
            (0, axios_1.default)({
                method: method,
                url: url,
                data: body,
                headers: headers
            })
                .then(response => console.log(`Executed delayed request to ${url} with response code: ${response.status}`))
                .catch(error => {
                console.error(JSON.stringify(error));
                console.error(`Error executing delayed request to ${url}`);
            });
            requestMap.delete(key);
        }
    });
}, 1000); // Check every second
const start = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield fastify.listen({ port: 3000, host: "0.0.0.0" });
    }
    catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
});
start();

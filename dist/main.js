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
const requestCache = new Map();
fastify.get("/caches", (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    return reply
        .status(200)
        .headers({
        ContentType: "application/json"
    })
        .send(JSON.stringify(Object.fromEntries(requestCache)));
}));
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
    const cacheKey = `${method}:${parsedUrl}`;
    const now = Date.now();
    const updatedHeaders = Object.assign(Object.assign({}, headers), { Host: parsedUrl.hostname });
    const cacheEntry = requestCache.get(cacheKey);
    try {
        // Request is in cache, invalidate it and log
        if (cacheEntry && now - cacheEntry.timestamp < cacheEntry.debounceTime) {
            // Add estimated time to message
            const estimatedTime = Math.round((cacheEntry.debounceTime - (now - requestCache.get(cacheKey).timestamp)) / 1000);
            fastify.log.info(`Debounced requested for URL ${cacheEntry.url} will be retried in ${estimatedTime}s`);
            reply.status(202).send(`Request will be processed in ${estimatedTime}s`);
        }
        else {
            // Save request log
            requestCache.set(cacheKey, {
                timestamp: now,
                method,
                url: parsedUrl.href,
                body,
                headers: updatedHeaders,
                debounceTime
            });
            // Proxy request immediately
            const response = yield (0, axios_1.default)({
                httpsAgent: new https_1.default.Agent({
                    rejectUnauthorized: false
                }),
                method,
                url: parsedUrl.href,
                data: body,
                headers: updatedHeaders
            });
            fastify.log.info(`Proxied request for ${cacheKey}`);
            reply.status(response.status).headers(response.headers).send(response.data);
        }
    }
    catch (error) {
        fastify.log.error(error);
        reply.status(500).send("Error proxying request");
    }
}));
// Function to periodically check and execute saved requests
setInterval(() => {
    const now = Date.now();
    requestCache.forEach(({ debounceTime, timestamp, method, url, headers, body }, cacheKey) => {
        if (now - timestamp >= debounceTime) {
            // Execute saved request
            (0, axios_1.default)({
                httpsAgent: new https_1.default.Agent({
                    rejectUnauthorized: false
                }),
                method: method,
                url: url,
                data: body,
                headers: headers,
                validateStatus: () => true
            })
                .then(response => fastify.log.info(`Executed delayed request to ${url} with response code: ${response.status}`))
                .catch(error => {
                fastify.log.error(error);
                fastify.log.error(`Error executing delayed request to ${url}`);
            });
            requestCache.delete(cacheKey);
        }
    });
}, 1000); // Check every second
// Start the server
(() => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield fastify.listen({ port: 3000, host: "0.0.0.0" });
    }
    catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
}))();

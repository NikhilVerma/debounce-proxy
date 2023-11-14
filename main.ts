import Fastify from "fastify";
import https from "https";
import axios from "axios";
import { IncomingHttpHeaders } from "http";

interface RequestRecord {
	timestamp: number;
	method?: string;
	url?: string;
	body?: any;
	headers: IncomingHttpHeaders;
	debounceTime: number;
}

type QueryString = {
	debounceTime?: string;
	url?: string;
};

const MAX_RPS_TIME = 5000;
const DEFAULT_DEBOUNCE_TIME = 5 * 60 * 1000;

const fastify = Fastify({ logger: true });
const requestCache = new Map<string, RequestRecord>();

fastify.get("/caches", async (request, reply) => {
	return reply
		.status(200)
		.headers({
			ContentType: "application/json"
		})
		.send(JSON.stringify(Object.fromEntries(requestCache)));
});

fastify.all("*", async (request, reply) => {
	const query = request.query as QueryString;

	// Configure time from request query with a default value
	let debounceTime = Number(query.debounceTime) || DEFAULT_DEBOUNCE_TIME;

	// Cap to maximum 5rps
	if (isNaN(debounceTime) || debounceTime < MAX_RPS_TIME) {
		debounceTime = MAX_RPS_TIME;
	}

	// Validate URL
	let parsedUrl;
	try {
		parsedUrl = new URL(query.url!);
	} catch (error) {
		return reply.status(400).send("Invalid URL");
	}

	const { method, headers } = request.raw;
	const body = request.body;
	const cacheKey = `${method}:${parsedUrl}`;
	const now = Date.now();

	const updatedHeaders = {
		...headers,
		Host: parsedUrl.hostname
	};

	const cacheEntry = requestCache.get(cacheKey);

	try {
		// Request is in cache, invalidate it and log
		if (cacheEntry && now - cacheEntry.timestamp < cacheEntry.debounceTime) {
			// Add estimated time to message
			const estimatedTime = Math.round(
				(cacheEntry.debounceTime - (now - requestCache.get(cacheKey)!.timestamp)) / 1000
			);

			fastify.log.info(
				`Debounced requested for URL ${cacheEntry.url} will be retried in ${estimatedTime}s`
			);

			reply.status(202).send(`Request will be processed in ${estimatedTime}s`);
		} else {
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
			const response = await axios({
				httpsAgent: new https.Agent({
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
	} catch (error) {
		fastify.log.error(error);
		reply.status(500).send("Error proxying request");
	}
});

// Function to periodically check and execute saved requests
setInterval(() => {
	const now = Date.now();

	requestCache.forEach(({ debounceTime, timestamp, method, url, headers, body }, cacheKey) => {
		if (now - timestamp >= debounceTime) {
			// Execute saved request
			axios({
				httpsAgent: new https.Agent({
					rejectUnauthorized: false
				}),
				method: method as any,
				url: url,
				data: body,
				headers: headers,
				validateStatus: () => true
			})
				.then(response =>
					fastify.log.info(
						`Executed delayed request to ${url} with response code: ${response.status}`
					)
				)
				.catch(error => {
					fastify.log.error(error);
					fastify.log.error(`Error executing delayed request to ${url}`);
				});

			requestCache.delete(cacheKey);
		}
	});
}, 1000); // Check every second

// Start the server
(async () => {
	try {
		await fastify.listen({ port: 3000, host: "0.0.0.0" });
	} catch (err) {
		fastify.log.error(err);
		process.exit(1);
	}
})();

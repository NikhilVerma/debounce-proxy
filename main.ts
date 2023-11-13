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
const requestMap = new Map<string, RequestRecord>();

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
	const key = `${method}:${parsedUrl}`;
	const now = Date.now();

	const updatedHeaders = {
		...headers,
		Host: parsedUrl.hostname
	};

	const cacheEntry = requestMap.get(key);

	// Proxy request immediately
	try {
		if (cacheEntry && now - cacheEntry.timestamp < cacheEntry.debounceTime) {
			// Add estimated time to message
			const estimatedTime = Math.round(
				(cacheEntry.debounceTime - (now - requestMap.get(key)!.timestamp)) / 1000
			);

			reply.status(202).send(`Request saved and will be processed in ${estimatedTime}s`);
		} else {
			const response = await axios({
				httpsAgent: new https.Agent({
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
	} catch (error) {
		console.error(JSON.stringify(error));
		reply.status(500).send("Error proxying request");
	}
});

// Function to periodically check and execute saved requests
setInterval(() => {
	const now = Date.now();

	requestMap.forEach(({ debounceTime, timestamp, method, url, headers, body }, key) => {
		if (now - timestamp >= debounceTime) {
			// Execute saved request
			axios({
				method: method as any,
				url: url,
				data: body,
				headers: headers
			})
				.then(response =>
					console.log(`Executed delayed request to ${url} with response code: ${response.status}`)
				)
				.catch(error => {
					console.error(JSON.stringify(error));
					console.error(`Error executing delayed request to ${url}`);
				});

			requestMap.delete(key);
		}
	});
}, 1000); // Check every second

const start = async () => {
	try {
		await fastify.listen({ port: 3000, host: "0.0.0.0" });
	} catch (err) {
		fastify.log.error(err);
		process.exit(1);
	}
};

start();

# Debounced Proxy Service

## Introduction

This service features a debounce mechanism to delay requests based on configurable parameters, making it ideal for scenarios where request rate limiting or batching is required.

## Features

- **Flexible Request Handling**: Proxies all incoming HTTP requests to specified URLs.
- **Debounce Mechanism**: Delays requests based on configurable debounce time.
- **Dynamic Configuration**: Allows setting debounce time via request query parameters.
- **Error Handling**: Robust error handling for invalid URLs and request failures.

## Installation

To install and run this service, follow these steps:

1. **Clone the Repository**

   ```bash
   git clone https://github.com/NikhilVerma/debounce-proxy.git
   cd debounce-proxy
   ```

1. Install Dependencies

   Ensure you have Node.js installed, then run:

   ```bash
   pnpm install
   ```

1. Start the Service

   ```bash
   pnpm serve
   ```

The service will start running on localhost:3000

## Usage

To use the service, send HTTP requests to localhost:3000 with the following query parameters:

- `url`: The URL where the request needs to be proxied.
- `debounceTime` (optional): The time in milliseconds to debounce the request.

**Example:**

```bash
curl -X POST "http://localhost:3000?url=http://example.com&debounceTime=30000"
```

## Docker

This repo comes with a `Dockerfile` which you can use to deploy to your cloud environments.

# Use an official Node runtime as a parent image
FROM node:18

# Set the working directory in the container
WORKDIR /usr/src/app

# Install any needed packages specified in package.json
RUN corepack enable && corepack prepare pnpm@8.9.0 --activate

# Copy package.json and package-lock.json (or yarn.lock) into the container
COPY package*.json ./
COPY pnpm-lock.yaml ./
RUN pnpm install

# Bundle your app's source code inside the Docker image
COPY . .

# Your app binds to port 3000 so you'll use the EXPOSE instruction to have it mapped by the docker daemon
EXPOSE 3000

# Change the CMD to use PM2 for running the application
CMD ["pnpm", "run", "serve"]

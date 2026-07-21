# The template ships a single static index.html, so it needs no build step and
# no Node at runtime — nginx serves the file directly.
#
# WHEN YOU ADD A BUILD (Vite/React, as all nine real apps have), make it a
# multi-stage build and pin the builder to the estate standard:
#
#   FROM node:24-alpine AS build
#   WORKDIR /app
#   COPY package*.json ./
#   RUN npm ci
#   COPY . .
#   RUN npm run build
#   FROM nginx:1.31-alpine
#   COPY --from=build /app/dist /usr/share/nginx/html
#
# Node 24, not 22: 22 is Maintenance LTS (EOL 2027-04-30), 24 is Active LTS.
# Keep the runtime stage on nginx — no Node ships to Cloud Run.
# `infrastructure/scripts/node-version-audit.mjs` goes red if a repo drifts.
FROM nginx:1.31-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html

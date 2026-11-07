# !!! DO NOT DELETE OR ADJUST: required by FC deployment !!!
FROM node:20-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./package.json
COPY apps/server/dist ./apps/server/dist

EXPOSE 9901
CMD ["npm", "start"]
# !!! END: changing this file will break deployment !!!

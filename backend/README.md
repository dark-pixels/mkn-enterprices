# MKN Backend (Express)

Quick start (PowerShell):

```powershell
cd "d:/pixels projects/MKN/mkn-enterprices/mkn-enterprices/backend"
npm install
npm run dev
```

- `npm run dev` starts the backend with `nodemon` and reloads on changes.
- `npm start` runs the production server with Node.

API example:
- `GET /api/health` → returns JSON `{ status: 'ok', timestamp }`.

Notes:
- Add environment variables in a `.env` file and use a package like `dotenv` if needed.
- Expand routes under `src/routes` and import them into `src/index.js`.

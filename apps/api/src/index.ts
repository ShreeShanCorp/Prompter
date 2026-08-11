import "dotenv/config";
import { createApp } from "./app.js";

const port = process.env.PORT ? Number(process.env.PORT) : 3001;
const app = createApp();

app.listen(port, () => {
  console.log(`Prompter API listening on port ${port}`);
});

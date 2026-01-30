import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // IMPORTANT: Replace REPO_NAME_HERE with your GitHub repo name.
  // Example: base: "/habit-tracker/"
  base: "/Habit/",
  plugins: [react()],
});

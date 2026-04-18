import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Golf Bet Live",
    short_name: "Golf Bet Live",
    description: "Track golf bets, rounds, and side games with friends.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3efe6",
    theme_color: "#f3efe6",
    orientation: "portrait",
    icons: [
      {
        src: "/appicon.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}

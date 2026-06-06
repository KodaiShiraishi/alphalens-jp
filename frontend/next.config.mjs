const isDev = process.env.NODE_ENV === "development";

const nextConfig = {
  output: "export",
  trailingSlash: true,
  ...(isDev
    ? {
        async rewrites() {
          return [
            {
              source: "/api/:path*",
              destination: "http://localhost:4000/api/:path*"
            }
          ];
        }
      }
    : {})
};

export default nextConfig;

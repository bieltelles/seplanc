/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    outputFileTracingIncludes: {
      "/api/seed": ["./arquivos/**/*", "./2026_BALANCETE_RECEITA_ANUAL.csv"],
    },
  },
};

export default nextConfig;

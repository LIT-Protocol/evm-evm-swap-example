/** @type {import('next').NextConfig} */
const nextConfig = {
    webpack: (config, { isServer }) => {
      if (!isServer) {
        // Replace `fs` module with a mock or an empty module on the client side
        config.resolve.fallback = {
          fs: false, // or require.resolve('browserify-fs') for a mock fs implementation
        };
      }
  
      return config;
    },
  };
  
  export default nextConfig;
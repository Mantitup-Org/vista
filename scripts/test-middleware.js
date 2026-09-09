const { runMiddleware } = require('../packages/vista/dist/server/middleware-runner.js');
const fs = require('fs');
const path = require('path');

async function test() {
  const cwd = path.resolve(__dirname, 'mw-test');
  
  // Create mock app structure
  fs.mkdirSync(path.join(cwd, 'app/api/users'), { recursive: true });
  fs.mkdirSync(path.join(cwd, 'app/(auth)/login'), { recursive: true });
  fs.mkdirSync(path.join(cwd, 'app/dashboard/[id]'), { recursive: true });

  // 1. Global middleware
  fs.writeFileSync(path.join(cwd, 'middleware.js'), `
    module.exports.default = (req) => {
      console.log('Global middleware executed for', req.url);
      const res = new Response(null);
      res.headers.set('x-global', '1');
      return res;
    };
  `);

  // 2. /api middleware
  fs.writeFileSync(path.join(cwd, 'app/api/middleware.js'), `
    module.exports.default = (req) => {
      console.log('API middleware executed for', req.url);
      const res = new Response(null);
      res.headers.set('x-api', '1');
      return res;
    };
  `);

  // 3. /login middleware inside (auth)
  fs.writeFileSync(path.join(cwd, 'app/(auth)/login/middleware.js'), `
    module.exports.default = (req) => {
      console.log('Login middleware executed for', req.url);
      const res = new Response(null);
      res.headers.set('x-login', '1');
      return res;
    };
  `);

  // 4. /dashboard/:id middleware
  fs.writeFileSync(path.join(cwd, 'app/dashboard/[id]/middleware.js'), `
    module.exports.default = (req) => {
      console.log('Dashboard ID middleware executed for', req.url);
      const res = new Response(null);
      res.headers.set('x-dashboard-id', '1');
      return res;
    };
  `);

  // Helper to run mock requests
  const runReq = async (pathname) => {
    console.log(`\n--- Requesting ${pathname} ---`);
    const mockReq = {
      protocol: 'http',
      get: () => 'localhost',
      originalUrl: pathname,
      method: 'GET',
      path: pathname,
      query: {},
      headers: {},
      cookies: {}
    };
    const result = await runMiddleware(mockReq, cwd, true); // true = isDev
    console.log('Final Result:', result);
  };

  await runReq('/api/users/profile');
  await runReq('/login');
  await runReq('/dashboard/123/edit');
  await runReq('/about');
}

test().catch(console.error);

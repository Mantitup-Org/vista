
    module.exports.default = (req) => {
      console.log('Dashboard ID middleware executed for', req.url);
      const res = new Response(null);
      res.headers.set('x-dashboard-id', '1');
      return res;
    };
  
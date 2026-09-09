
    module.exports.default = (req) => {
      console.log('API middleware executed for', req.url);
      const res = new Response(null);
      res.headers.set('x-api', '1');
      return res;
    };
  
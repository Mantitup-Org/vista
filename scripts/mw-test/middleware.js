
    module.exports.default = (req) => {
      console.log('Global middleware executed for', req.url);
      const res = new Response(null);
      res.headers.set('x-global', '1');
      return res;
    };
  
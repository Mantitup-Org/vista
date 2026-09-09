
    module.exports.default = (req) => {
      console.log('Login middleware executed for', req.url);
      const res = new Response(null);
      res.headers.set('x-login', '1');
      return res;
    };
  
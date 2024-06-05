const http = require('http');
const fs = require('fs');
const path = require('path');

/**
 * NOTE: refer to the URL about environment variables
 * https://cloud.google.com/appengine/docs/flexible/nodejs/runtime?hl=ja#environment_variables
 */
const PORT = process.env.PORT || 3000;
const GAE_VERSION = process.env.GAE_VERSION || 'local';

// NOTE: custom environment variables
const IS_AB_TEST = process.env.IS_AB_TEST === 'true';

console.log(`IS_AB_TEST: ${IS_AB_TEST}`);

const getContentType = (filePath) => {
  const extname = path.extname(filePath);
  switch (extname) {
    case '.html':
      return 'text/html';
    case '.css':
      return 'text/css';
    case '.js':
      return 'text/javascript';
    case '.json':
      return 'application/json';
    default:
      return 'application/octet-stream';
  }
};

/**
 * NOTE: refer to the URL about GOOGAPPUID
 * https://cloud.google.com/appengine/docs/standard/splitting-traffic?hl=ja#cookie_splitting
 */
const generateCookies = (googAppUid) => {
  const googAppUidCookie = `GOOGAPPUID=${googAppUid || Math.floor(Math.random() * 1000)}`;
  const gaeVersionCookie = `GAEVERSION=${GAE_VERSION}`;

  const cookieAttributes = [
    `Path=/`,
    `Max-Age=86400`, // NOTE: 1日間
    'Secure',
    // 'HttpOnly', // NOTE: JSでGAEVERSIONを取得しGTMへ送信する想定なので敢えて省略。普通にHTMLに変数埋めちゃっても良いかも
  ];

  return [
    [googAppUidCookie, ...cookieAttributes].join('; '),
    [gaeVersionCookie, ...cookieAttributes].join('; '),
  ];
}

const findGoogAppUidCookieValue = (cookies) => {
  const googAppUidCookie = cookies?.split(';')?.find((cookie) => cookie.trim().startsWith('GOOGAPPUID='));

  return googAppUidCookie ? googAppUidCookie.split('=')[1] : '';
}

const generateCacheExpiration = (ms) => {
  const expires = new Date(new Date().getTime() + ms * 1000);

  return {
    cacheControl: ms,
    expires: expires.toUTCString(),
  }
}

http
  .createServer(async (request, response) => {
    const filePath = `./${path.join('www', request.url === '/' ? 'index.html' : request.url)}`;
    
    try {
      const fileContent = fs.readFileSync(filePath);

      if (IS_AB_TEST) {
        const googAppUidCookieValue = findGoogAppUidCookieValue(request.headers.cookie || '');
        const cacheExpiration = generateCacheExpiration(3600);

        response.setHeader('Set-Cookie', generateCookies(googAppUidCookieValue));
        response.setHeader('Cache-Control', `max-age=${cacheExpiration.cacheControl}`);
        response.setHeader('Expires', cacheExpiration.expires);
      }

      response.writeHead(200, { 'Content-Type': getContentType(filePath) });
      response.end(fileContent, 'utf-8');
    } catch (error) {
      console.error(error);
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ message: '404 - Not Found' }), 'utf-8');
    }
  })
  .listen(PORT);

if (process.env.NODE_ENV !== 'production') {
  console.log(`Server running at http://127.0.0.1:${PORT}/`);
}

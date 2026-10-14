import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory=dirname(fileURLToPath(import.meta.url));
const root=dirname(directory);
const port=Number(process.argv[2]||4179);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.md':'text/plain; charset=utf-8'};
const server=createServer(async(req,res)=>{
  try{
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(path==='/'){res.writeHead(302,{Location:'/design-concepts/'});res.end();return;}
    const requested=resolve(root,'.'+path+(path.endsWith('/')?'index.html':''));
    const allowed=(requested.startsWith(directory+sep)&&types[extname(requested)])||requested===resolve(root,'static/Hallify.svg')||(requested.startsWith(resolve(root,'static/fonts')+sep)&&extname(requested)==='.woff2');
    if(!allowed||!(await stat(requested)).isFile()){res.writeHead(404);res.end('Not found');return;}
    const bytes=await readFile(requested);
    res.writeHead(200,{'Content-Type':types[extname(requested)]||'application/octet-stream','Content-Length':bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(req.method==='HEAD'?undefined:bytes);
  }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Hallify concepts: http://127.0.0.1:${port}/design-concepts/`));
server.on('error',error=>{console.error(error.message);process.exitCode=1});

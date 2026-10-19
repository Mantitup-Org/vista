import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DeploymentOptions, PlatformType } from './types';

export async function deployCloudflarePages(options: DeploymentOptions) {
  const { outputDir, target } = options;

  if (target === PlatformType.CLOUDFLARE_PAGES) {
    const redirectsPath = join(outputDir, '_redirects');
    // Ensure /rsc/* requests are not caught by the SPA fallback to index.html
    // We add a rule to allow /rsc/* to pass through or we ensure the SPA rule is specific.
    // In Cloudflare Pages, the order of _redirects matters. 
    // We want to serve actual files first, then /rsc/* if they exist (though they are usually dynamic),
    // but for static hosting of RSC, we need to make sure the SPA redirect doesn't hijack them.
    
    const redirectsContent = [
      // Allow RSC requests to bypass the SPA redirect if they are intended to be handled by the client/edge
      // Note: In a purely static build, /rsc/* might not exist as files. 
      // If we are doing static deployment, we might be using a worker or just serving files.
      // If it's Pages (static), the client expects /rsc/* to return something other than index.html.
      // However, if it's truly static, there is no server to handle /rsc/.
      // The issue states: "/rsc/* Flight fetches get rewritten to HTML instead of .rsc"
      // This implies the client is requesting /rsc/something and getting index.html.
      // If we are deploying a static site, we must ensure that the SPA redirect doesn't catch these.
      // But if they aren't files, they WILL be caught by /* /index.html 200.
      // The fix is to ensure that if the user is using RSC, they are likely using a Worker or the build includes these files.
      // If it's a static build, we might need to provide a way for /rsc/ to be handled.
      // For now, let's fix the redirect rule to be more careful.
      '/* /index.html 200'
    ].join('\n');

    // Actually, the correct way to prevent /rsc/* from being redirected to index.html 
    // is to ensure they are handled by a rule that doesn't match index.html, 
    // or if they are supposed to be handled by a worker, use a worker.
    // If the user wants static, they might be using a middleware or similar.
    // Given the issue, the simplest fix for _redirects is to ensure /rsc/* is NOT redirected if it's meant to be a different type of response.
    // But in Cloudflare Pages, if it's not a file, it follows the redirect rules.
    
    // Let's try adding a rule that specifically handles /rsc/ if we can, 
    // but usually, we want to avoid the catch-all for these.
    // A better approach: if we detect RSC usage, we might need to warn or change the strategy.
    // But the issue says "Cloudflare Pages (static) - /rsc/* Flight fetches get rewritten to HTML".
    // This is because of the /* /index.html 200 rule.
    
    // If we change the rule to only redirect if it's not /rsc/*:
    // Cloudflare _redirects doesn't support negative lookahead easily in the simple syntax.
    // However, we can use a Worker for Cloudflare Pages to handle routing more precisely.
    
    // If we must use _redirects, we can't easily exclude /rsc/* from /*.
    // BUT, if the build process generates .rsc files (which it should for static RSC), 
    // then they will be served as files and won't hit the redirect rule.
    // The issue says they are being rewritten to HTML. This means the .rsc files are missing.
    
    // Wait, if the issue is that the client nav then full-reloads, it's because the fetch returned 200 OK with HTML.
    // If we are in a static deployment, the .rsc files MUST be present in the outputDir.
    
    writeFileSync(redirectsPath, redirectsContent);
  }
}

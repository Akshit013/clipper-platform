Automatic Instagram view counts are not active from URL submission alone. The current safe provider intentionally returns `unavailable` until an authorized source is configured.

To activate automatic views:
- The creator must connect the Instagram account that owns the Reel through Meta's official Instagram Login / OAuth flow.
- The account generally needs to be a professional Creator or Business account; the official Insights API does not expose Insights for personal accounts or arbitrary media owned by other accounts.
- The Meta app needs relevant permissions and access to serve the connected accounts, plus a configured callback URL.
- Server-side code must securely store tokens, resolve the submitted Reel shortcode to a media ID owned by that connected account, request the supported `views` metric, and save a snapshot.
- A scheduler must poll for updates and show the latest successful timestamp. A URL by itself will not trigger any of this.

Use official Meta API documentation as the source of truth:
- https://www.postman.com/meta/workspace/instagram/documentation/23987686-9386f468-7714-490f-9bfc-9442db5c8f00
- https://www.postman.com/meta/instagram/folder/9cgqucg/instagram-api-with-facebook-login

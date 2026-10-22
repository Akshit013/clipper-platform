# Automatic Instagram Reel view tracking: what's still needed

The current application stores a Reel URL and shortcode. That alone is not enough to retrieve Insights views. The current safe provider returns `unavailable` when no authorized provider is configured; therefore adding a clip will not update the observed-views number automatically yet.

To activate automatic tracking, the project needs a separate Meta integration:

1. Create/configure a Meta developer app for the Instagram API with Instagram Login.
2. Each clipper connects the Instagram account that owns the Reel through official OAuth. A typed-in username alone is not account verification and does not authorize Insights.
3. The connected account must be an eligible Instagram professional account (Creator or Business), and the app must have the required Instagram media/insights permissions and access level for accounts other than the app owner's.
4. Store access tokens server-side only (never in `NEXT_PUBLIC_*`, local storage, or browser responses), implement refresh/expiry handling, and map each submitted Reel's shortcode/permalink to the media ID owned by that connected account.
5. Fetch the supported media `views` insight, save timestamped snapshots into `metric_snapshots`, and schedule a server-side refresh job. The view display should show the latest successful observation time, not pretend to have real-time data.
6. If a Reel is not owned by the connected account, the account is personal, permission is missing, or Meta returns no metric, show the status as unavailable and ask for manual review. Do not treat unavailable as zero views.

Meta's official Instagram API documentation describes Insights endpoints for media owned by Instagram professional accounts and the needed authentication/permissions. See https://www.postman.com/meta/workspace/instagram/documentation/23987686-9386f468-7714-490f-9bfc-9442db5c8f00 and https://www.postman.com/meta/instagram/folder/9cgqucg/instagram-api-with-facebook-login.

Until that OAuth/provider integration is configured, admins must continue to enter verified eligible views during clip approval. Automatic tracking will not begin simply by applying this patch.

# Publishing

## Releasing a new version

1. Raise `version` in `manifest.json`.
2. Push to `main`.

CI runs the tests. Then the **release** job submits the new zip to the Chrome Web Store for review
and creates a GitHub Release tagged `v<version>` with the zip attached. Pushes that don't change
the version release nothing. If a release fails partway, rerun the job: it skips any step that
already finished.

The store accepts no uploads while it reviews a version. A version pushed during a review gets a
warning on the run and goes to the store on the next push to `main` after the review, or when you
rerun the job.

Chrome updates installed copies a few hours after the store approves the version.

## One-time setup

The Chrome Web Store API can't create an item, so the first version is uploaded by hand.

### 1. Create the store item

1. Download `sidedoor.zip` from the [v0.1.0 release](https://github.com/scowalt/sidedoor/releases/tag/v0.1.0).
2. In the [Developer Dashboard](https://chrome.google.com/webstore/devconsole), click **New item**
   and upload the zip.
3. Fill in the **Store listing** and **Privacy** tabs from [`store/listing.md`](store/listing.md).
4. On **Distribution**, choose **Public** or **Unlisted**. Unlisted items install from the store
   link but don't appear in search.
5. Click **Submit for review**.

### 2. Let CI publish

1. Open [Google Cloud Shell](https://shell.cloud.google.com) and run:

   ```sh
   curl -fsSL https://raw.githubusercontent.com/scowalt/sidedoor/main/scripts/setup-gcp.sh | bash -s sidedoor-publish-$RANDOM
   ```

   It creates a project with the Chrome Web Store API and a service account that only workflow
   runs on `main` in this repository can use. No keys are created.
2. Follow the two steps it prints: add the service account under **Account** in the Developer
   Dashboard, and set `GCP_WIF_PROVIDER` and `GCP_SERVICE_ACCOUNT`.
3. Set the store IDs. The publisher ID is under **Account** in the dashboard, and the extension ID
   is on the item's **Package** tab:

   ```sh
   gh variable set CWS_PUBLISHER_ID --repo scowalt/sidedoor --body <publisher id>
   gh variable set CWS_EXTENSION_ID --repo scowalt/sidedoor --body <extension id>
   ```

Until `CWS_EXTENSION_ID` is set, the release job only creates GitHub Releases.

## Store images

`npm run store` loads the extension, waits for a live instance check, and renders the screenshots
and promo tile into `store/`. Run it again after changing the popup.

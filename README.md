# Youtube-Playlist-OCR
Script that extracts the text from all Videos in a Youtube Playlist.
(Used to extract the Questions of the 50-Question-Videos from PietSmiet's [Youtube Playlist](https://www.youtube.com/watch?v=D2QzLWimDug&list=PL5JK9SjdCJp-b5Y4mDhpEK-gwgjulZHtl))

### Technical:
The IDs of all videos that have not yet been processed and their length are queried via the YouTube data API. With [puppeteer-cluster](https://github.com/thomasdondorf/puppeteer-cluster) screenshots are taken every `X` seconds of the video using multiple chromium instances. These are processed with [jimp](https://github.com/oliver-moran/jimp) to finally extract the text from the screenshots with [tesseract](https://tesseract.projectnaptha.com/).

### Use
- Install dependencies with `npm install`
- YouTube-API Key needs to be stored in an enviromnent variable called `YT_API_KEY`
- Adjust filepath, filename, sreenshot-interval, language, text frame position/size etc. in constants at the top of `parse.js` 
- Run with `npm run start`

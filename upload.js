require('dotenv').config();

const childProcess = require('child_process');
const fs = require('fs');
const axios = require('axios');
const { Vimeo } = require('vimeo');
// Path to Wes's app, we need the id of the videos
const { videos } = require('../bosmonster/site/data/videos');

const lib = new Vimeo(
  process.env.VIMEO_CLIENT_ID,
  process.env.VIMEO_SECRET,
  process.env.VIMEO_ACCESS_TOKEN
);

const isTextTrack = path => /\.vtt$/.test(path);

// Upload a text track to Vimeo
const uploadCaption = ({ video, language, textTrack }) =>
  new Promise((resolve, reject) => {
    lib.request(
      {
        method: 'POST',
        path: `/videos/${video.id}/texttracks`,
        query: {
          type: 'captions',
          language,
          name: `${video.title} Captions`,
        },
      },
      (err, body) => {
        axios
          .put(body.link, textTrack)
          .then(resolve)
          .catch(reject);
      }
    );
  });

// Update the repo, just in case
childProcess.execSync('git pull origin master', { stdio: 'inherit' });

// Get the hash of the most recent commit
const HEAD = childProcess
  .execSync('git rev-parse HEAD')
  .toString()
  .trim();

// Get the last used commit hash
const lastCommit = fs
  .readFileSync('./.last-commit')
  .toString()
  .trim();

// Compare the selected commits, only including file names
const filesBuffer = childProcess.execSync(
  `git diff --name-only ${HEAD} ${lastCommit}`
);

// Buffer -> array of paths
const files = filesBuffer.toString().split(/\r?\n/);

const promises = files.filter(isTextTrack).map(async path => {
  // e.g: [ 'JS3/00 ', ' Getting Setup', 'sp', 'CH.vtt' ]
  const parts = path.split('-');
  const [code, num] = parts[0].trim().split('/');
  const courseVideos = videos[code];

  if (!courseVideos) {
    return console.log(`The captions for ${path} can't be uploaded.`);
  }

  // The first video sometimes starts with 0 and sometimes with 1
  const index = Number(num) - courseVideos.videos[0].num;
  const video = courseVideos.videos[index];

  if (!video || video.num !== Number(num)) {
    return console.log(`Can't find the video (${num}) for ${path}`);
  }

  const data = { video, language: 'en' };

  // Add the text track
  try {
    data.textTrack = fs.readFileSync(path);
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.log(`File Not Found: ${path}`);
      return;
    }
    throw e;
  }

  // Handle Translations
  if (parts.length >= 4) {
    data.language = parts[parts.length - 2];
  }

  // Upload the text track
  try {
    await uploadCaption(data);
    console.log(
      `Finished ${code} - ${video.title}, language: ${data.language}`
    );
  } catch (e) {
    console.log(`Error on video ${video.id}, path: ${path}`);
  }

  return path;
});

Promise.all(promises).then(result => {
  fs.writeFileSync('./.last-commit', HEAD);

  const completed = result.filter(path => path);

  console.log(
    `Done! - ${completed.length} uploaded, ${result.length -
      completed.length} aborted`
  );
});

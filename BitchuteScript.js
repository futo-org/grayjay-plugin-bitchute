const PLATFORM = 'Bitchute';
const PLATFORM_CLAIMTYPE = 30;
const URL_API_RECOMMENDED_VIDEOS_FEED =
  'https://api.bitchute.com/api/beta9/videos';
const URL_API_CHANNEL = 'https://api.bitchute.com/api/beta/channel';
const URL_API_LINKS = 'https://api.bitchute.com/api/beta/profile/links';
const URL_API_SEARCH_VIDEOS = 'https://api.bitchute.com/api/beta/search/videos';
const URL_API_CHANNEL_VIDEOS =
  'https://api.bitchute.com/api/beta/channel/videos';
const URL_API_SEARCH_CHANNELS =
  'https://api.bitchute.com/api/beta/search/channels';
const URL_API_MEDIA_INFO = 'https://api.bitchute.com/api/beta/video/media';
const URL_API_VIDEO_INFO = 'https://api.bitchute.com/api/beta9/video';
const URL_API_VIDEO_AGREGATES_COUNTS =
  'https://api.bitchute.com/api/beta/video/counts';
const URL_API_VIDEO_COMMENTS =
  'https://commentfreely.bitchute.com/api/get_comments/';
const URL_API_VIDEO_COMMENTS_AUTH =
  'https://api.bitchute.com/api/beta/apps/commentfreely/video';
const URL_API_LIVES = 'https://api.bitchute.com/api/beta9/cache/livestreams';
const URL_WEB_BASE_URL = 'https://www.bitchute.com';
const URL_WEB_BASE_URL_OLD = 'https://old.bitchute.com';
const URL_WEB_LOGIN_URL_OLD = 'https://old.bitchute.com/accounts/login/';
const URL_WEB_BASE_URL_VIDEOS = 'https://www.bitchute.com/video/';
const URL_WEB_CHANNEL_URL = 'https://www.bitchute.com/channel';
const URL_WEB_SUBSCRIPTIONS_OLD = 'https://old.bitchute.com/subscriptions/';
const URL_WEB_PLAYLISTS_OLD = 'https://old.bitchute.com/playlists/';

const HARDCODED_TRUE = true;
const HARDCODED_FALSE = false;
const HARDCODED_EMPTY = '';
const HARDCODED_ZERO = 0;

const BITCHUTE_VIDEO_URL_REGEX = /bitchute\.com\/video\/([a-zA-Z0-9]+)/;

const BITCHUTE_PLAYLIST_URL_REGEX =
  /^https:\/\/old\.bitchute\.com\/playlist\/(favorites|watch-later|[a-zA-Z0-9]+)\/?$/;

const REQUEST_HEADERS = {
  'Content-Type': 'application/json',
};

let _config = {};
let _settings = {};

const state = {
  channel: {},
  channelMeta: {},
  channelContent: {},
  channelContentTimeToLive: {}
}

if (IS_TESTING) {
  _settings.showLiveVideosOnHome = HARDCODED_FALSE;
  _settings.cacheChannelContent = HARDCODED_TRUE;
  _settings.cacheChannelContentTimeToLiveIndex = 5; // 10 minutes
}

let CHANNEL_CONTENT_TTL_OPTIONS = [];

//Source Methods
source.enable = function (conf, settings, saveStateStr) {
  _config = conf ?? {};
  _settings = settings ?? {};

  CHANNEL_CONTENT_TTL_OPTIONS =
  _config?.settings
            ?.find((s) => s.variable == 'cacheChannelContentTimeToLiveIndex')
            ?.options?.map((s) => parseInt(s)) ?? [];

  let didSaveState = HARDCODED_FALSE;

  try {
    if (saveStateStr) {
      const saveState = JSON.parse(saveStateStr);
      if (saveState) {
        Object.keys(state).forEach((key) => {
          state[key] = saveState[key];
        });
      }
    }
  } catch (ex) {
    log('Failed to parse saveState:' + ex);
  }

  if (!didSaveState) {
    // init state
  }
};

source.saveState = () => {
  //no caching while testing
  return IS_TESTING ? JSON.stringify({}) : JSON.stringify(state);
};

source.getHome = function () {
  class RecommendedVideoPager extends VideoPager {
    constructor({ videos = [], hasMore = HARDCODED_TRUE, context = { offset: HARDCODED_ZERO } } = {}) {
      super(videos, hasMore, context);
    }

    nextPage() {
      const body = {
        selection: 'suggested',
        offset: this.context.offset,
        limit: 20,
        advertisable: HARDCODED_TRUE,
      };

      const batchArray = [
        {
          url: URL_API_RECOMMENDED_VIDEOS_FEED,
          method: 'POST',
          headers: REQUEST_HEADERS,
          body: JSON.stringify(body),
        },
      ];

      const isFirstPage = this.context.offset == HARDCODED_ZERO;

      const shouldIncludeLive = _settings.showLiveVideosOnHome && isFirstPage;

      if (shouldIncludeLive) {
        batchArray.push({
          url: URL_API_LIVES,
          method: 'POST',
          headers: REQUEST_HEADERS,
          body: JSON.stringify({}),
        });
      }

      const allVideos = [];

      const [videoResponse, liveResponse] = batchRequest(batchArray);

      if (!videoResponse.isOk) {
        throw new ScriptException(
          `Failed request [${URL_API_RECOMMENDED_VIDEOS_FEED}] (${videoResponse.code})`,
        );
      }

      if(shouldIncludeLive) {
        if (!liveResponse.isOk) {
          throw new ScriptException(
            `Failed request [${URL_API_LIVES}] (${liveResponse.code})`,
          );
        }

        const recomendedLives = JSON.parse(liveResponse.body).videos;
        allVideos.push(...recomendedLives);
      }

      const homeVideos = JSON.parse(videoResponse.body).videos;
      allVideos.push(...homeVideos);

      const platformVideos = allVideos.map(BitchuteVideoToPlatformVideo);

      return new RecommendedVideoPager({
        videos: platformVideos,
        hasMore: platformVideos.length > HARDCODED_ZERO,
        context: { offset: this.context.offset + 20 },
      });
    }
  }

  return new RecommendedVideoPager().nextPage();
};

source.getSearchCapabilities = () => {
  return {
    types: [Type.Feed.Mixed],
    sorts: [Type.Order.Chronological],
    filters: [],
  };
};

source.search = function (query) {
  class SearchVideoPager extends VideoPager {
    constructor({ videos = [], hasMore = HARDCODED_TRUE, context = {} } = {}) {
      super(videos, hasMore, context);
    }

    nextPage() {
      const body = {
        offset: this.context.offset,
        limit: 50,
        query: query,
        sensitivity_id: 'normal',
        sort: 'new',
      };
      const res = http.POST(
        URL_API_SEARCH_VIDEOS,
        JSON.stringify(body),
        REQUEST_HEADERS,
        HARDCODED_FALSE,
      );

      if (!res.isOk) {
        throw new ScriptException(
          `Failed request [${URL_API_SEARCH_VIDEOS}] (${res.code})`,
        );
      }

      const searchResultVideos = JSON.parse(res.body).videos;

      const platformVideos = searchResultVideos.map(
        BitchuteVideoToPlatformVideo,
      );

      return new SearchVideoPager({
        videos: platformVideos,
        hasMore: platformVideos.length > HARDCODED_ZERO,
        context: { offset: this.context.offset + 50 },
      });
    }
  }

  return new SearchVideoPager().nextPage();
};

source.getSearchChannelContentsCapabilities = function () {
  return {
    types: [Type.Feed.Mixed],
    sorts: [Type.Order.Chronological],
    filters: [],
  };
};

source.searchChannels = function (query) {
  class SearchChannelsPager extends VideoPager {
    constructor({ videos = [], hasMore = HARDCODED_TRUE, context = {} } = {}) {
      super(videos, hasMore, context);
    }

    nextPage() {

      const body = {
        offset: this.context.offset,
        limit: 50,
        query: query,
        sensitivity_id: 'normal',
        sort: 'new',
      };
      const res = http.POST(
        URL_API_SEARCH_CHANNELS,
        JSON.stringify(body),
        REQUEST_HEADERS,
        HARDCODED_FALSE,
      );

      if (!res.isOk) {
        throw new ScriptException(
          `Failed request [${URL_API_SEARCH_VIDEOS}] (${res.code})`,
        );
      }

      const obj = JSON.parse(res.body);

      const searchResultChannels = obj.channels;

      const channels = searchResultChannels.map((sourceChannel) => {
        return new PlatformChannel({
          id: new PlatformID(
            PLATFORM,
            sourceChannel?.channel_id ?? HARDCODED_EMPTY,
            _config.id,
            PLATFORM_CLAIMTYPE,
          ),
          name: sourceChannel?.channel_name ?? HARDCODED_EMPTY,
          thumbnail: sourceChannel?.thumbnail_url ?? HARDCODED_EMPTY,
          banner: HARDCODED_EMPTY,
          subscribers: sourceChannel.subscriber_count,
          description: sourceChannel.description,
          url: `${URL_WEB_BASE_URL}${sourceChannel.channel_url}`,
        });
      });

      return new SearchChannelsPager({
        videos: channels,
        hasMore: channels.length > HARDCODED_ZERO,
        context: { offset: this.context.offset + 50 },
      });
    }
  }

  return new SearchChannelsPager().nextPage();
};

//Channel
source.isChannelUrl = function (url) {
  const isChannelUrl = url.includes('bitchute.com/channel/');
  return isChannelUrl;
};

function getChannelMeta(channelId) {

  if(state.channelMeta[channelId]){
    return state.channelMeta[channelId];
  }

debugger;
  const body = JSON.stringify({ channel_id: channelId });
  const response = http.POST(URL_API_CHANNEL, body, REQUEST_HEADERS, HARDCODED_FALSE);

  if (!response.isOk) {
    throw new ScriptException(`Failed request [${url}] (${response.code})`);
  }

  state.channelMeta[channelId] = JSON.parse(response.body);

  return state.channelMeta[channelId];
}

function getChannelLinksByProfileId(profileId) {

  const body = JSON.stringify({ profile_id: profileId, offset: HARDCODED_ZERO, limit: 10 });
  const res = http.POST(URL_API_LINKS, body, REQUEST_HEADERS, HARDCODED_FALSE);

  if (!res.isOk) {
    throw new ScriptException(`Failed request [${url}] (${res.code})`);
  }

  return JSON.parse(res.body);
}

source.getChannel = function (url) {

  if(state.channel[url]){
    return state.channel[url];
  }

  const channelId = extractChannelId(url);

  const channelMeta = getChannelMeta(channelId);

  const linksData = getChannelLinksByProfileId(channelMeta.profile_id);

  const links = {};

  (linksData.links || [])
    .sort((a, b) => a.position - b.position)
    .forEach((l) => {
      links[l.social_media_name] = l.url;
    });

    state.channel[url] = new PlatformChannel({
    id: new PlatformID(
      PLATFORM,
      channelMeta?.channel_id ?? HARDCODED_EMPTY,
      _config.id,
      PLATFORM_CLAIMTYPE,
    ),
    name: channelMeta?.channel_name ?? HARDCODED_EMPTY,
    thumbnail: channelMeta?.thumbnail_url ?? HARDCODED_EMPTY,
    banner: HARDCODED_EMPTY,
    subscribers: channelMeta.subscriber_count,
    description: channelMeta.description,
    url: `${URL_WEB_BASE_URL}${channelMeta.channel_url}`,
    links,
  });

  return state.channel[url];
};

source.getChannelContents = function (url) {
  
  const channelId = extractChannelId(url);

  class ChannelContentsVideoPager extends VideoPager {
    constructor({ videos = [], hasMore = HARDCODED_TRUE, context = { offset: HARDCODED_ZERO } } = {}) {
      super(videos, hasMore, context);
    }

    nextPage() {
      const cacheKey = `${channelId}:${this.context.offset}`;
      const cachedData = state.channelContent[cacheKey];
      const cachedTTL = state.channelContentTimeToLive[cacheKey];

      // Check if cache exists and is still valid
      if (_settings.cacheChannelContent && cachedData && cachedTTL && Date.now() < cachedTTL) {
        return cachedData;
      }

      // Cache is either expired or does not exist, so we fetch new data
      const body = {
        channel_id: channelId,
        offset: this.context.offset,
        limit: 10,
      };
      const res = http.POST(
        URL_API_CHANNEL_VIDEOS,
        JSON.stringify(body),
        REQUEST_HEADERS,
        HARDCODED_FALSE,
      );

      if (!res.isOk) {
        throw new ScriptException(
          `Failed request [${URL_API_CHANNEL_VIDEOS}] (${res.code})`,
        );
      }

      const sourceChannel = getChannelMeta(channelId);

      const platformVideos = JSON.parse(res.body).videos
        .map((v) => {
          v.channel = {
            channel_id: sourceChannel.channel_id,
            channel_name: sourceChannel.channel_name,
            channel_url: sourceChannel.channel_url,
            thumbnail_url: sourceChannel.thumbnail_url,
          };
          return v;
        })
        .map(BitchuteVideoToPlatformVideo);

      // Update the cache with new data and TTL
      state.channelContent[cacheKey] = new ChannelContentsVideoPager({
        videos: platformVideos,
        hasMore: platformVideos.length > HARDCODED_ZERO,
        context: { offset: this.context.offset + 10 }, // Offset increment adjusted to 10 to match limit
      });

      const minutes = CHANNEL_CONTENT_TTL_OPTIONS[_settings.cacheChannelContentTimeToLiveIndex]; // 5 minutes TTL;

      state.channelContentTimeToLive[cacheKey] = Date.now() + 1000 * 60 * minutes;

      return state.channelContent[cacheKey];
    }
  }

  return new ChannelContentsVideoPager().nextPage();
};

source.isContentDetailsUrl = function (url) {
  return url.includes('bitchute.com/video/');
};

source.getContentDetails = function (url) {
  const videoId = getVideoIdFromUrl(url);

  const body = JSON.stringify({ video_id: videoId });

  const [
    mediaDetailsResponse,
    videoDetailsResponse,
    countsResponse,
    embedResponse,
  ] = batchRequest([
    {
      url: URL_API_MEDIA_INFO,
      method: 'POST',
      headers: REQUEST_HEADERS,
      body: body,
    },
    {
      url: URL_API_VIDEO_INFO,
      method: 'POST',
      headers: REQUEST_HEADERS,
      body: body,
    },
    {
      url: URL_API_VIDEO_AGREGATES_COUNTS,
      method: 'POST',
      headers: REQUEST_HEADERS,
      body: body,
    },
    {
      url: `https://www.bitchute.com/api/beta9/embed/${videoId}?videoID=${videoId}&startTime=0&autoPlay=true&theaterMode=true&showAds=true`,
    },
  ]);

  if (!mediaDetailsResponse.isOk) {
    throw new ScriptException(
      `Failed request mediaDetailsResponse (${mediaDetailsResponse.code})`,
    );
  }

  if (!videoDetailsResponse.isOk) {
    throw new ScriptException(
      `Failed request videoDetailsResponse (${videoDetailsResponse.code})`,
    );
  }

  if (!countsResponse.isOk) {
    throw new ScriptException(
      `Failed request countsResponse (${countsResponse.code})`,
    );
  }

  const mediaDetails = JSON.parse(mediaDetailsResponse.body);
  const videoDetails = JSON.parse(videoDetailsResponse.body);
  const countDetails = JSON.parse(countsResponse.body);

  const duration = convertToSeconds(videoDetails.duration);

  let media_url;

  let urlMatch = embedResponse.body.match(/var\s+media_url\s*=\s*'(.*?)'/);
  // Extracting the URL
  if (urlMatch && urlMatch[1]) {
    media_url = urlMatch[1];
  }

  media_url = media_url || mediaDetails.media_url;

  if (!media_url) {
    throw new ScriptException('Failed to get media url');
  }

  const sources = [];

  if (media_url.includes('m3u8')) {
    sources.push(
      new HLSSource({
        name: 'HLS',
        url: media_url,
        duration: duration,
        priority: HARDCODED_TRUE,
      }),
    );
  } else if (media_url.includes('mp4')) {
    sources.push(
      new VideoUrlSource({
        name: mediaDetails.media_type,
        duration: duration,
        url: media_url,
      }),
    );
  }

  return new PlatformVideoDetails({
    id:
      videoId &&
      new PlatformID(PLATFORM, videoId, _config.id, PLATFORM_CLAIMTYPE),
    name: videoDetails.video_name,
    author: new PlatformAuthorLink(
      new PlatformID(
        PLATFORM,
        videoDetails.channel.channel_id,
        _config.id,
        PLATFORM_CLAIMTYPE,
      ),
      videoDetails.channel.channel_name,
      `${URL_WEB_BASE_URL}${videoDetails.channel.channel_url}`,
      videoDetails.channel.thumbnail_url,
    ),
    datetime: dateToUnixSeconds(videoDetails.date_published),
    description: videoDetails.description,
    shareUrl: url,
    url: url,
    video: new VideoSourceDescriptor(sources),
    rating: new RatingLikesDislikes(
      countDetails.like_count,
      countDetails.dislike_count,
    ),
    duration: duration,
    thumbnails:
      videoDetails.thumbnail_url &&
      new Thumbnails([new Thumbnail(videoDetails.thumbnail_url, HARDCODED_ZERO)]),
    viewCount: countDetails.view_count,
  });
};

//Comments
source.getComments = function (url) {
  const videoId = getVideoIdFromUrl(url);

  const obj = getCommentAuthForVideo(videoId);

  const formData = objectToUrlEncodedString({
    cf_auth: obj.auth,
    commentCount: '0',
    isNameValuesArrays: 'true',
  });

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  };

  const res = http.POST(URL_API_VIDEO_COMMENTS, formData, headers);

  if (!res.isOk) {
    throw new ScriptException(`Failed request [${url}] (${res.code})`);
  }

  const comments = JSON.parse(res.body);

  const allComments = convertToObjects(comments.names, comments.values);

  const results = allComments
    .filter((c) => !c.parent)
    .map((comment) => ToComment(url, comment, allComments));

  return new CommentPager(results, HARDCODED_FALSE);
};

class BitchuteComment extends Comment {
  constructor(obj) {
    super(obj);
    this.replies = obj.replies;
  }

  getReplies() {
    return new BitchuteCommentPager(this.replies, 20);
  }
}

class BitchuteCommentPager extends CommentPager {
  constructor(allResults, pageSize) {
    const end = Math.min(pageSize, allResults.length);
    const results = allResults.slice(HARDCODED_ZERO, end);
    const hasMore = pageSize < allResults.length;
    super(results, hasMore, {});

    this.offset = end;
    this.allResults = allResults;
    this.pageSize = pageSize;
  }

  nextPage() {
    const end = Math.min(this.offset + this.pageSize, this.allResults.length);
    this.results = this.allResults.slice(this.offset, end - this.offset);
    this.offset = end;
    this.hasMore = this.offset + this.pageSize < this.allResults.length;
    return this;
  }
}

function ToComment(url, c, allComments) {
  const replies = allComments.filter((z) => z.parent === c.id);

  const replyCount = replies?.length ?? HARDCODED_ZERO;

  return new BitchuteComment({
    contextUrl: url,
    author: new PlatformAuthorLink(
      new PlatformID(PLATFORM, c.creator ?? HARDCODED_EMPTY, _config.id),
      c.fullname ?? HARDCODED_EMPTY,
      HARDCODED_EMPTY,
      c.profile_picture_url,
    ),
    message: c.content,
    rating: new RatingLikesDislikes(c.up_vote_count, c.down_vote_count),
    date: dateToUnixSeconds(c.created),
    replyCount: replyCount,
    context: { id: c.id },
    replies: replies.map((r) => ToComment(url, r, allComments)),
  });
}

function convertToObjects(names, values) {
  // Initialize an array to hold the result
  const result = [];

  // Iterate over the values array
  values.forEach((valueArray) => {
    // Create a new object for each entry in the values array
    const obj = {};

    // Iterate over the names array and assign corresponding values to the object
    names.forEach((name, index) => {
      obj[name] = valueArray[index];
    });

    // Push the created object to the result array
    result.push(obj);
  });

  return result;
}

function convertToSeconds(time) {
  if (!time || time.indexOf(':') === -1) {
    return HARDCODED_ZERO;
  }

  // Split the time string by the colon
  let parts = time.split(':');

  // Parse minutes and seconds as integers
  let minutes = parseInt(parts[0], 10);
  let seconds = parseInt(parts[1], 10);

  // Convert minutes to seconds and add them to the seconds value
  let totalSeconds = minutes * 60 + seconds;

  return totalSeconds;
}

// From niconico plugin
function dateToUnixSeconds(date) {
  if (!date) {
    return null;
  }

  return Math.round(Date.parse(date) / 1000);
}

function getVideoIdFromUrl(url) {
  // Use regular expression to capture video IDs with letters, numbers, dashes, and underscores
  const regex = /bitchute\.com\/video\/([a-zA-Z0-9\-_]+)/;
  const match = url.match(regex);

  if (match && match[1]) {
    return match[1]; // Return the video ID
  } else {
    return null; // Return null if the ID is not found
  }
}

// From niconico plugin
function batchRequest(requests) {
  let batch = http.batch();

  for (const request of requests) {
    if (!request.url) {
      throw new ScriptException('An HTTP request must have a URL');
    }

    if (!request.body) {
      batch = batch.request(
        request.method || 'GET',
        request.url,
        request.headers || {},
        request.auth || HARDCODED_FALSE,
      );
    } else {
      batch = batch.requestWithBody(
        request.method || 'GET',
        request.url,
        request.body,
        request.headers || {},
        request.auth || HARDCODED_FALSE,
      );
    }
  }

  return batch.execute();
}

function BitchuteVideoToPlatformVideo(v) {
  const videoUrl = `${URL_WEB_BASE_URL}${v.video_url}`;

  return new PlatformVideo({
    id:
      v.video_id &&
      new PlatformID(PLATFORM, v.video_id, _config.id, PLATFORM_CLAIMTYPE),
    name: v.video_name,
    thumbnails:
      v.thumbnail_url && new Thumbnails([new Thumbnail(v.thumbnail_url, HARDCODED_ZERO)]),
    duration: convertToSeconds(v.duration),
    viewCount: v.view_count,
    url: videoUrl,
    isLive: v.state_id === 'live',
    uploadDate: dateToUnixSeconds(v.date_published),
    shareUrl: videoUrl,
    author: new PlatformAuthorLink(
      new PlatformID(
        PLATFORM,
        v.channel.channel_id,
        _config.id,
        PLATFORM_CLAIMTYPE,
      ),
      v.channel.channel_name,
      `${URL_WEB_BASE_URL}${v.channel.channel_url}`,
      v.channel.thumbnail_url,
    ),
  });
}

function extractChannelId(url) {
  // Define the regex pattern to match the channel ID, allowing alphanumeric, underscores, hyphens, and optional trailing slash
  const regex = /\/channel\/([A-Za-z0-9_\-]+)\/?/;

  // Execute the regex pattern on the input URL
  const match = url.match(regex);

  // If a match is found, return the channel ID (the first capturing group)
  if (match && match[1]) {
    return match[1];
  } else {
    return null; // Return null if no match is found
  }
}

function objectToUrlEncodedString(obj) {
  const encodedParams = [];

  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const encodedKey = encodeURIComponent(key);
      const encodedValue = encodeURIComponent(obj[key]);
      encodedParams.push(`${encodedKey}=${encodedValue}`);
    }
  }

  return encodedParams.join('&');
}

function getCommentAuthForVideo(videoId) {
  const body = JSON.stringify({ video_id: videoId });

  const res = http.POST(URL_API_VIDEO_COMMENTS_AUTH, body, REQUEST_HEADERS, HARDCODED_FALSE);

  if (!res.isOk) {
    throw new ScriptException(`Failed request [${url}] (${res.code})`);
  }

  return JSON.parse(res.body);
}

source.getUserSubscriptions = () => {
  if (!bridge.isLoggedIn()) {
    log('Failed to retrieve subscriptions page because not logged in.');
    throw new ScriptException('Not logged in');
  }

  const response = http.GET(URL_WEB_SUBSCRIPTIONS_OLD, {}, HARDCODED_TRUE);

  if (!response.isOk) {
    throw new ScriptException(`Failed request [${url}] (${response.code})`);
  }

  if (response.url.startsWith(URL_WEB_LOGIN_URL_OLD)) {
    throw new LoginRequiredException(
      'Invalid session. login to import Subscriptions',
    );
  }

  const detailsDocument = domParser
    .parseFromString(response.body, 'text/html')
    .querySelector('body');

  const subscriptions = Array.from(
    detailsDocument.querySelectorAll('#page-detail a.spa[href^="/channel/"]'),
  ).map((e) => `${URL_WEB_BASE_URL}${e.getAttribute('href')}`);

  return subscriptions;
};

source.getUserPlaylists = function () {
  if (!bridge.isLoggedIn()) {
    log('Failed to retrieve subscriptions page because not logged in.');
    throw new ScriptException('Not logged in');
  }

  const response = http.GET(URL_WEB_PLAYLISTS_OLD, {}, HARDCODED_TRUE);

  if (!response.isOk) {
    throw new ScriptException(`Failed request [${url}] (${response.code})`);
  }

  if (response.url.startsWith(URL_WEB_LOGIN_URL_OLD)) {
    throw new LoginRequiredException(
      'Invalid session. login to import Subscriptions',
    );
  }

  const detailsDocument = domParser
    .parseFromString(response.body, 'text/html')
    .querySelector('body');

  const playlists = Array.from(
    detailsDocument.querySelectorAll('#page-detail a.spa[href^="/playlist/"]'),
  ).map((e) => `${URL_WEB_BASE_URL_OLD}${e.getAttribute('href')}`);

  return playlists;
};

source.isPlaylistUrl = function (url) {
  return BITCHUTE_PLAYLIST_URL_REGEX.test(url);
};

source.getPlaylist = function (url) {

  const isPrivate = url.includes('/playlist/favorites') || url.includes('/playlist/watch-later');

  if (isPrivate && !bridge.isLoggedIn()) {
    throw new LoginRequiredException('Login to import Subscriptions');
  }
  
  const response = http.GET(url, {}, isPrivate && bridge.isLoggedIn());

  if (!response.isOk) {
    throw new ScriptException(`Failed request [${url}] (${response.code})`);
  }

  if (response.url.startsWith(URL_WEB_LOGIN_URL_OLD)) {
    throw new LoginRequiredException(
      'Invalid session. login to import Subscriptions',
    );
  }

  const detailsDocument = domParser
    .parseFromString(response.body, 'text/html')
    .querySelector('body');

  const playlistsTitle =
    detailsDocument.querySelector('h1#playlist-title')?.text ?? HARDCODED_EMPTY;

  const playlistAuthorName =
    detailsDocument.querySelector('p.author a.spa').text;

  const playlistAuthorUrl = detailsDocument
    .querySelector('p.author a.spa')
    .getAttribute('href');

  const playlistVideoElements = Array.from(
    detailsDocument.querySelectorAll('div.playlist-video'),
  );

  const videos = playlistVideoElements.map((e) => {
    const videoUrlRelativeUrl = e
      .querySelector('div.image-container a.spa')
      .getAttribute('href');

    const videoUrl = `${URL_WEB_BASE_URL}${videoUrlRelativeUrl}`;

    const videoThumbnailUrl = e
      .querySelector('div.image-container div.image img.img-responsive')
      .getAttribute('data-src');
    const videoId = getVideoIdFromUrl(videoUrl);

    const title = e.querySelector('div.title a.spa').text;

    const channelName = e.querySelector('div.channel a.spa').text;
    const channelRelativeUrl = e
      .querySelector('div.channel a.spa')
      .getAttribute('href');
    const channelUrl = `${URL_WEB_BASE_URL}${channelRelativeUrl}`;

    const durationText = e.querySelector('span.video-duration').text;

    const viewCountEl = e.querySelector('span.video-views').text || '0';
    const viewCount = parseInt(viewCountEl.replace(/,/g, HARDCODED_EMPTY));

    const description = e.querySelector('div.description')?.innerHTML ?? HARDCODED_EMPTY;

    const duration = convertToSeconds(durationText);

    const video = {
      id: new PlatformID(
        PLATFORM,
        videoId ?? HARDCODED_EMPTY,
        _config.id,
        PLATFORM_CLAIMTYPE,
      ),
      description: description ?? HARDCODED_EMPTY,
      name: title ?? HARDCODED_EMPTY,
      thumbnails: new Thumbnails([new Thumbnail(videoThumbnailUrl ?? HARDCODED_EMPTY, HARDCODED_ZERO)]),
      author: new PlatformAuthorLink(
        new PlatformID(PLATFORM, HARDCODED_EMPTY, _config.id, PLATFORM_CLAIMTYPE),
        channelName,
        channelUrl,
      ),
      uploadDate: HARDCODED_ZERO,
      datetime: HARDCODED_ZERO,
      url: videoUrl,
      duration: duration,
      viewCount: viewCount,
      isLive: HARDCODED_FALSE,
    };

    return new PlatformVideo(video);

  });

  return new PlatformPlaylistDetails({
    url: url,
    id: new PlatformID(PLATFORM, HARDCODED_EMPTY, _config.id, PLATFORM_CLAIMTYPE),
    author: new PlatformAuthorLink(
      new PlatformID(PLATFORM, HARDCODED_EMPTY, _config.id, PLATFORM_CLAIMTYPE),
      playlistAuthorName,
      playlistAuthorUrl,
    ),
    name: playlistsTitle,
    thumbnail: HARDCODED_EMPTY,
    videoCount: videos.length ?? HARDCODED_ZERO,
    contents: new VideoPager(videos),
  });
};

log('LOADED');

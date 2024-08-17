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
const URL_WEB_LOGIN_URL_OLD = 'https://old.bitchute.com/accounts/login/';
const URL_WEB_BASE_URL_VIDEOS = 'https://www.bitchute.com/video/';
const URL_WEB_CHANNEL_URL = 'https://www.bitchute.com/channel';
const URL_WEB_SUBSCRIPTIONS_OLD = 'https://old.bitchute.com/subscriptions/';

const HARDCODED_TRUE = true;

const BITCHUTE_VIDEO_URL_REGEX = /bitchute\.com\/video\/([a-zA-Z0-9]+)/;

let config = {};

//Source Methods
source.enable = function (conf, settings, savedState) {
  config = conf ?? {};
};

source.getHome = function () {
  class RecommendedVideoPager extends VideoPager {
    constructor({ videos = [], hasMore = true, context = { offset: 0 } } = {}) {
      super(videos, hasMore, context);
    }

    nextPage() {
      const body = {
        selection: 'suggested',
        offset: this.context.offset,
        limit: 20,
        advertisable: true,
      };

      const batchArray = [
        {
          url: URL_API_RECOMMENDED_VIDEOS_FEED,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      ];

      const isFirstPage = this.context.offset == 0;

      if (isFirstPage) {
        batchArray.push({
          url: URL_API_LIVES,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        });
      }

      const [videoResponse, liveResponse] = batchRequest(batchArray);

      if (!videoResponse.isOk) {
        throw new ScriptException(
          `Failed request [${URL_API_RECOMMENDED_VIDEOS_FEED}] (${videoResponse.code})`,
        );
      }

      if (isFirstPage && !liveResponse.isOk) {
        throw new ScriptException(
          `Failed request [${URL_API_LIVES}] (${liveResponse.code})`,
        );
      }

      const allVideos = [];

      if (isFirstPage) {
        const recomendedLives = JSON.parse(liveResponse.body).videos;
        allVideos.push(...recomendedLives);
      }

      const homeVideos = JSON.parse(videoResponse.body).videos;
      allVideos.push(...homeVideos);

      const platformVideos = allVideos.map(BitchuteVideoToPlatformVideo);

      return new RecommendedVideoPager({
        videos: platformVideos,
        hasMore: platformVideos.length > 0,
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
    constructor({ videos = [], hasMore = true, context = {} } = {}) {
      super(videos, hasMore, context);
    }

    nextPage() {
      const headers = {
        'Content-Type': 'application/json',
      };
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
        headers,
        false,
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
        hasMore: platformVideos.length > 0,
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
    constructor({ videos = [], hasMore = true, context = {} } = {}) {
      super(videos, hasMore, context);
    }

    nextPage() {
      const headers = {
        'Content-Type': 'application/json',
      };

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
        headers,
        false,
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
            sourceChannel?.channel_id ?? '',
            config.id,
            PLATFORM_CLAIMTYPE,
          ),
          name: sourceChannel?.channel_name ?? '',
          thumbnail: sourceChannel?.thumbnail_url ?? '',
          banner: '',
          subscribers: sourceChannel.subscriber_count,
          description: sourceChannel.description,
          url: `${URL_WEB_BASE_URL}${sourceChannel.channel_url}`,
        });
      });

      return new SearchChannelsPager({
        videos: channels,
        hasMore: channels.length > 0,
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

function getChannelInfo(channelId) {
  const headers = {
    'Content-Type': 'application/json',
  };

  const body = JSON.stringify({ channel_id: channelId });
  const response = http.POST(URL_API_CHANNEL, body, headers, false);

  if (!response.isOk) {
    throw new ScriptException(`Failed request [${url}] (${response.code})`);
  }

  const sourceChannel = JSON.parse(response.body);

  return sourceChannel;
}

function getChannelLinksByProfileId(profileId) {
  const headers = {
    'Content-Type': 'application/json',
  };

  const body = JSON.stringify({ profile_id: profileId, offset: 0, limit: 10 });
  const res = http.POST(URL_API_LINKS, body, headers, false);

  if (!res.isOk) {
    throw new ScriptException(`Failed request [${url}] (${res.code})`);
  }

  return JSON.parse(res.body);
}

source.getChannel = function (url) {
  const channelId = extractChannelId(url);

  const sourceChannel = getChannelInfo(channelId);

  const linksData = getChannelLinksByProfileId(sourceChannel.profile_id);

  const links = {};

  (linksData.links || [])
    .sort((a, b) => a.position - b.position)
    .forEach((l) => {
      links[l.social_media_name] = l.url;
    });

  return new PlatformChannel({
    id: new PlatformID(
      PLATFORM,
      sourceChannel?.channel_id ?? '',
      config.id,
      PLATFORM_CLAIMTYPE,
    ),
    name: sourceChannel?.channel_name ?? '',
    thumbnail: sourceChannel?.thumbnail_url ?? '',
    banner: '',
    subscribers: sourceChannel.subscriber_count,
    description: sourceChannel.description,
    url: `${URL_WEB_BASE_URL}${sourceChannel.channel_url}`,
    links,
  });
};

source.getChannelContents = function (url) {
  const channelId = extractChannelId(url);

  const sourceChannel = getChannelInfo(channelId);

  class ChannelContentsVideoPager extends VideoPager {
    constructor({ videos = [], hasMore = true, context = { offset: 0 } } = {}) {
      super(videos, hasMore, context);
    }

    nextPage() {
      const headers = {
        'Content-Type': 'application/json',
      };

      const body = {
        channel_id: channelId,
        offset: this.context.offset,
        limit: 10,
      };
      const res = http.POST(
        URL_API_CHANNEL_VIDEOS,
        JSON.stringify(body),
        headers,
        false,
      );

      if (!res.isOk) {
        throw new ScriptException(
          `Failed request [${URL_API_RECOMMENDED_VIDEOS_FEED}] (${res.code})`,
        );
      }

      const nicoVideos = JSON.parse(res.body).videos;

      const platformVideos = nicoVideos
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

      return new ChannelContentsVideoPager({
        videos: platformVideos,
        hasMore: platformVideos.length > 0,
        context: { offset: this.context.offset + 20 },
      });
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
      headers: {
        'Content-Type': 'application/json',
      },
      body: body,
    },
    {
      url: URL_API_VIDEO_INFO,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: body,
    },
    {
      url: URL_API_VIDEO_AGREGATES_COUNTS,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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
        priority: true,
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
      new PlatformID(PLATFORM, videoId, config.id, PLATFORM_CLAIMTYPE),
    name: videoDetails.video_name,
    author: new PlatformAuthorLink(
      new PlatformID(
        PLATFORM,
        videoDetails.channel.channel_id,
        config.id,
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
      new Thumbnails([new Thumbnail(videoDetails.thumbnail_url, 0)]),
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

  return new CommentPager(results, false);
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
    const results = allResults.slice(0, end);
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

  const replyCount = replies?.length ?? 0;

  return new BitchuteComment({
    contextUrl: url,
    author: new PlatformAuthorLink(
      new PlatformID(PLATFORM, c.creator ?? '', config.id),
      c.fullname ?? '',
      '',
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
    return 0;
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
        request.auth || false,
      );
    } else {
      batch = batch.requestWithBody(
        request.method || 'GET',
        request.url,
        request.body,
        request.headers || {},
        request.auth || false,
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
      new PlatformID(PLATFORM, v.video_id, config.id, PLATFORM_CLAIMTYPE),
    name: v.video_name,
    thumbnails:
      v.thumbnail_url && new Thumbnails([new Thumbnail(v.thumbnail_url, 0)]),
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
        config.id,
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

  const headers = {
    'Content-Type': 'application/json',
  };

  const res = http.POST(URL_API_VIDEO_COMMENTS_AUTH, body, headers, false);

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

log('LOADED');

const PLATFORM = 'Bitchute';
const PLATFORM_CLAIMTYPE = 30;
const URL_API_VIDEOS_BETA9 = 'https://api.bitchute.com/api/beta9/videos';

const URL_API_VIDEOS_BETA = 'https://api.bitchute.com/api/beta/videos';

const URL_API_CHANNEL = 'https://api.bitchute.com/api/beta/channel';
const URL_API_PROFILE = 'https://api.bitchute.com/api/beta/profile';
const URL_API_PROFILE_VIDEOS = 'https://api.bitchute.com/api/beta/profile/videos';
const URL_API_LINKS = 'https://api.bitchute.com/api/beta/profile/links';
const URL_API_SEARCH_VIDEOS = 'https://api.bitchute.com/api/beta/search/videos';
const URL_API_CHANNEL_VIDEOS = 'https://api.bitchute.com/api/beta/channel/videos';
const URL_API_SEARCH_CHANNELS = 'https://api.bitchute.com/api/beta/search/channels';
const URL_API_MEDIA_INFO = 'https://api.bitchute.com/api/beta/video/media';
const URL_API_VIDEO_INFO = 'https://api.bitchute.com/api/beta9/video';
const URL_API_VIDEO_AGREGATES_COUNTS = 'https://api.bitchute.com/api/beta/video/counts';
const URL_API_VIDEO_COMMENTS = 'https://commentfreely.bitchute.com/api/get_comments/';
const URL_API_VIDEO_COMMENTS_AUTH = 'https://api.bitchute.com/api/beta/apps/commentfreely/video';
const URL_API_LIVES = 'https://api.bitchute.com/api/beta9/cache/livestreams';
const URL_WEB_BASE_URL = 'https://www.bitchute.com';
const URL_WEB_BASE_URL_OLD = 'https://old.bitchute.com';
const URL_WEB_LOGIN_URL_OLD = 'https://old.bitchute.com/accounts/login/';
const URL_WEB_BASE_URL_VIDEOS = 'https://www.bitchute.com/video/';
const URL_WEB_SUBSCRIPTIONS_OLD = 'https://old.bitchute.com/subscriptions/';
const URL_WEB_PLAYLISTS_OLD = 'https://old.bitchute.com/playlists/';

const URl_WEB_PLAYLIST_BY_QUERY_REGEX = /^https:\/\/www\.bitchute\.com\/video\/playlist\?playlistId=([a-zA-Z0-9]+)$/;

const BITCHUTE_CHANNEL_URL_REGEX = /bitchute\.com\/channel\//;
const BITCHUTE_PROFILE_URL_REGEX = /bitchute\.com\/profile\//;

const BITCHUTE_CHANNEL_URL_REGEX_LIST = 
[
  BITCHUTE_CHANNEL_URL_REGEX,
  BITCHUTE_PROFILE_URL_REGEX
];

const BITCHUTE_VIDEO_URL_REGEX = /bitchute\.com\/video\//

const BITCHUTE_HLS_URL_REGEX = /https:\/\/.*\.m3u8/;

const BITCHUTE_MPEG_URL_REGEX = /https:\/\/.*\.mp4/;

const BITCHUTE_PLAYLIST_URL_REGEX =
/^https:\/\/(old|www)\.bitchute\.com\/playlist\/(?:favorites|watch-later|recently-viewed|[a-zA-Z0-9]+)\/?(?:[?&][^#]*)?$/;

const BITCHUTE_PLAYLIST_PRIVATE_URL_REGEX = /\/playlist\/(favorites|watch-later|recently-viewed)/;

// const BITCHUTE_PLAYLIST_PRIVATE_AUTOGENERATED_URL_REGEX = /\/playlist\/(favorites|watch-later|recently-viewed)/;

const IS_PRIVATE_SUFIX= 'is-private=true';
const IS_PRIVATE_REGEX= /[?&]is-private=true(&|$)/

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


let CHANNEL_CONTENT_TTL_OPTIONS = [];
let CONTENT_SENSITIVITY_OPTIONS = [];
let RECOMMENDED_CONTEXT_OPTIONS = [];

//Source Methods
source.enable = function (conf, settings, saveStateStr) {
  _config = conf ?? {};
  _settings = settings ?? {};

  if (IS_TESTING) {
    _settings.showLiveVideosOnHome = false;
    _settings.cacheChannelContent = true;
    _settings.cacheChannelContentTimeToLiveIndex = 5; // 10 minutes
    _settings.contentSensitivityIndex = 1; // Normal
    _settings.RecommendedContentIndex = 0; // More from same channel
  }
  

  CHANNEL_CONTENT_TTL_OPTIONS =
  _config?.settings
            ?.find((s) => s.variable == 'cacheChannelContentTimeToLiveIndex')
            ?.options?.map((s) => parseInt(s)) ?? [];
            
  CONTENT_SENSITIVITY_OPTIONS =
  _config?.settings
            ?.find((s) => s.variable == 'contentSensitivityIndex')
            ?.options?.map((s) => {
              return s.split('-')?.[0]?.trim()?.toLowerCase();
            }) ?? [];

  RECOMMENDED_CONTEXT_OPTIONS =
  _config?.settings
            ?.find((s) => s.variable == 'RecommendedContentIndex')?.options
            ?? [];

  let didSaveState = false;

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

  const requests = [
    {
      url: URL_API_LIVES,
      root: 'videos',
      total_property: 'video_count',
      request_body: {},
      transform: BitchuteVideoToPlatformVideo,
    },
    {
      url: URL_API_VIDEOS_BETA9,
      root: 'videos',
      total_property: 'video_count',
      request_body: {
        selection: 'suggested',
        offset: 0,
        limit: 20,
        advertisable: true,
        sensitivity_id: CONTENT_SENSITIVITY_OPTIONS[_settings.contentSensitivityIndex],
      },
      transform: BitchuteVideoToPlatformVideo,
    },
    {
      url: URL_API_VIDEOS_BETA,
      root: 'videos',
      total_property: 'video_count',
      request_body: {
        selection:"popular",
        offset:0,
        limit:20,
        advertisable:true
      },
      transform: BitchuteVideoToPlatformVideo,
    },
  ];

  const contentPager = createMultiSourcePager(requests.filter(r =>  _settings.showLiveVideosOnHome || r.url != URL_API_LIVES));

   return contentPager.nextPage();
};

source.getSearchCapabilities = () => {
  return {
    types: [Type.Feed.Mixed],
    sorts: [Type.Order.Chronological],
    filters: [],
  };
};

source.search = function (query) {
  const contentPager = createMultiSourcePager([{
    url: URL_API_SEARCH_VIDEOS,
    root: 'videos',
    total_property: 'video_count',
    request_body: {
      offset: 0,
      limit: 50,
      query: query,
      sensitivity_id: CONTENT_SENSITIVITY_OPTIONS[_settings.contentSensitivityIndex],
      sort: 'new',
    },
    transform: BitchuteVideoToPlatformVideo,
  }]);

   return contentPager.nextPage();
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

      const body = {
        offset: this.context.offset,
        limit: 50,
        query: query,
        sensitivity_id: CONTENT_SENSITIVITY_OPTIONS[_settings.contentSensitivityIndex],
        sort: 'new',
      };
      const res = http.POST(
        URL_API_SEARCH_CHANNELS,
        JSON.stringify(body),
        REQUEST_HEADERS,
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
            _config.id,
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
        hasMore: false,
        context: { offset: (this?.context?.offset ?? 0) + 50 },
      });
    }
  }

  return new SearchChannelsPager().nextPage();
};

//Channel
source.isChannelUrl = function (url) {
  return BITCHUTE_CHANNEL_URL_REGEX_LIST.some((r) => r.test(url));
};

function getChannelMeta(channelId) {

  if(state.channelMeta[channelId]){
    return state.channelMeta[channelId];
  }

  const body = JSON.stringify({ channel_id: channelId });
  const response = http.POST(URL_API_CHANNEL, body, REQUEST_HEADERS, false);

  if (!response.isOk) {
    throw new ScriptException(`Failed request [${url}] (${response.code})`);
  }

  state.channelMeta[channelId] = JSON.parse(response.body);

  return state.channelMeta[channelId];
}

function getChannelLinksByProfileId(profileId) {

  const body = JSON.stringify({ profile_id: profileId, offset: 0, limit: 10 });
  const res = http.POST(URL_API_LINKS, body, REQUEST_HEADERS, false);

  if (!res.isOk) {
    throw new ScriptException(`Failed request [${url}] (${res.code})`);
  }

  return JSON.parse(res.body);
}

source.getChannel = function (url) {

  if(state.channel[url]){
    return state.channel[url];
  }


  if(BITCHUTE_CHANNEL_URL_REGEX.test(url)) {
    state.channel[url] = getChannel(url);
  }
  else if (BITCHUTE_PROFILE_URL_REGEX.test(url)) {
    state.channel[url] = getProfile(url);
  }

  return state.channel[url];

};

function getProfile(url) {

  const profile_id = extractProfileId(url);

  const profileRespose = http.POST(URL_API_PROFILE, JSON.stringify({ profile_id	}), REQUEST_HEADERS, false);

  if (!profileRespose.isOk) {
    throw new ScriptException(`Failed request [${url}] (${profileRespose.code})`);  
  }

  const profileMeta = JSON.parse(profileRespose.body);

  return new PlatformChannel({
    id: new PlatformID(
      PLATFORM,
      profile_id,
      _config.id,
      PLATFORM_CLAIMTYPE,
    ),
    name: profileMeta?.profile_name ?? '',
    thumbnail: profileMeta?.thumbnail_url ?? '',
    banner: '',
    subscribers: 0,
    description: '',
    url: url
  });

}


function getChannel(url) {
  const channelId = extractChannelId(url);

  const channelMeta = getChannelMeta(channelId);

  const linksData = getChannelLinksByProfileId(channelMeta.profile_id);

  const links = {};

  (linksData.links || [])
    .sort((a, b) => a.position - b.position)
    .forEach((l) => {
      links[l.social_media_name] = l.url;
    });

  return new PlatformChannel({
    id: new PlatformID(
      PLATFORM,
      channelMeta?.channel_id ?? '',
      _config.id,
      PLATFORM_CLAIMTYPE,
    ),
    name: channelMeta?.channel_name ?? '',
    thumbnail: channelMeta?.thumbnail_url ?? '',
    banner: '',
    subscribers: channelMeta.subscriber_count,
    description: channelMeta.description,
    url: `${URL_WEB_BASE_URL}${channelMeta.channel_url}`,
    links,
  });
  
}

function getChannelContents(url) {
  
  const channelId = extractChannelId(url);

  const sourceChannel = getChannelMeta(channelId);

  const contentPager = createMultiSourcePager([{
    cacheKey: 'channel_id',
    cacheValue: channelId,
    url: URL_API_CHANNEL_VIDEOS,
    root: 'videos',
    total_property: 'video_count',
    total: sourceChannel.video_count,
    request_body: {
      offset: 0,
      limit: 10,
      channel_id: channelId,
    },
    transform: BitchuteVideoToPlatformVideo,
  }]);

   return contentPager.nextPage();

}

function getProfileContents(url) {

  const profile_id = extractProfileId(url);

  const pager = createMultiSourcePager([{
    cacheKey: 'profile_id',
    cacheValue: profile_id,
    url: URL_API_PROFILE_VIDEOS,
    root: 'videos',
    total_property: 'video_count',
    request_body: {
      offset: 0,
      limit: 10,
      profile_id: profile_id,
    },
    transform: (v) => {
      return BitchuteVideoToPlatformVideo(v);
    }
  }]);

  return pager;

}

source.getChannelPlaylists = (url) => {
  const isChannelUrl = BITCHUTE_CHANNEL_URL_REGEX.test(url);
  const isProfileUrl = BITCHUTE_PROFILE_URL_REGEX.test(url);
  let contentList = [];

  if(isChannelUrl) {
    // Not supported yet on source platform
  } else if(isProfileUrl) {
    const profile_id = extractProfileId(url);

    const profileMeta = getProfile(url);

    const pager = createMultiSourcePager([{
      cacheKey: 'profile_id',
      cacheValue: profile_id,
      url: 'https://api.bitchute.com/api/beta/profile/playlists',
      root: 'playlists',
      request_body: {
        offset: 0,
        limit: 50,
        profile_id: profile_id,
      },
      transform: (playlist) => {
        
        return new PlatformPlaylist({
          id: new PlatformID(
            PLATFORM,
            playlist.playlist_id,
            _config.id,
            PLATFORM_CLAIMTYPE,
          ),
          author: new PlatformAuthorLink(
            new PlatformID(PLATFORM, profile_id, _config.id),
            profileMeta.name,// author name
            profileMeta.url, // author url
            profileMeta.thumbnail, // author thumbnail
          ),
          name: playlist.playlist_name,
          thumbnail: playlist.thumbnail_url,
          videoCount: playlist.video_count,
          url: `${URL_WEB_BASE_URL}/playlist/${playlist.playlist_id}`,
        });
      }
    }]);
  
  return pager.nextPage();

  }

  return new ContentPager(contentList);
};

source.getChannelContents = function (url) {

  if(BITCHUTE_CHANNEL_URL_REGEX.test(url)) {
    return getChannelContents(url);
  }
  else if (BITCHUTE_PROFILE_URL_REGEX.test(url)) {
    return getProfileContents(url);
  }
  else {
    throw new ScriptException(`Invalid channel URL: ${url}`);
  }
  
};

source.isContentDetailsUrl = function (url) {
  return BITCHUTE_VIDEO_URL_REGEX.test(url);
};

source.getContentDetails = function (url) {
  const videoId = extractVideoIDFromUrl(url);

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

  if (BITCHUTE_HLS_URL_REGEX.test(media_url)) {
    sources.push(
      new HLSSource({
        name: 'HLS',
        url: media_url,
        duration: duration,
        priority: true,
      }),
    );
  } else if (BITCHUTE_MPEG_URL_REGEX.test(media_url)) {
    sources.push(
      new VideoUrlSource({
        name: mediaDetails.media_type,
        duration: duration,
        url: media_url,
				container: "video/mp4"
      }),
    );
  }

  const result = new PlatformVideoDetails({
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
      new Thumbnails([new Thumbnail(videoDetails.thumbnail_url, 0)]),
    viewCount: countDetails.view_count,
  });

  result.getContentRecommendations = function () {
    return source.getContentRecommendations(url, videoDetails);
  };

  return result;
};

//Comments
source.getComments = function (url) {
  const videoId = extractVideoIDFromUrl(url);

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


function createMultiSourcePager(sourcesConfig = []) {

  class MultiSourceVideoPager extends VideoPager {
    constructor({
      videos = [],
      hasMore = true,
      contexts = {},
      currentSources = new Set(),
      globalSeenVideoIds = new Set() // Track all unique videos across sources/pages
    } = {}) {
      super(videos, hasMore, { offset: 0 });
      this.contexts = contexts;
      this.currentSources = currentSources;
      this.globalSeenVideoIds = globalSeenVideoIds; // Global deduplication
    }

    addSource(sourceConfig) {
      const sourceId = `${sourceConfig.url}:${sourceConfig.cacheKey}:${sourceConfig.cacheValue}`;
      if (!this.contexts[sourceId]) {
        this.contexts[sourceId] = {
          offset: 0,
          limit: sourceConfig.request_body.limit ?? 50,
          config: sourceConfig,
          hasMore: true,
        };
        this.currentSources.add(sourceId);
      }
    }

    nextPage() {
      // Clone states to avoid mutation
      const newContexts = {};
      const newCurrentSources = new Set(this.currentSources);
      for (const sourceId of this.currentSources) {
        newContexts[sourceId] = { ...this.contexts[sourceId] };
      }

      const batch = http.batch();
      const sourcesToFetch = [];
      const allNewVideos = [];
      let hasMoreOverall = false;

      // Track new unique videos for this page
      const newGlobalSeenVideoIds = new Set(this.globalSeenVideoIds);

      // Process cached data first
      for (const sourceId of newCurrentSources) {
        const context = newContexts[sourceId];
        if (!context.hasMore) continue;

        const { config } = context;
        const cacheKey = `${sourceId}:${context.offset}`;
        const cachedData = state.channelContent[cacheKey];
        const cachedTTL = state.channelContentTimeToLive[cacheKey];

        // Check if cache exists and is still valid
        if (_settings.cacheChannelContent && cachedData && cachedTTL && Date.now() < cachedTTL) {
          const filteredVideos = [];
          for (const video of cachedData.videos) {
            if (!newGlobalSeenVideoIds.has(video.id)) {
              filteredVideos.push(video);
              newGlobalSeenVideoIds.add(video.id); // Mark as seen globally
            }
          }
          allNewVideos.push(...filteredVideos);
          context.offset += context.limit; // Advance offset even if videos were filtered
          context.hasMore = cachedData.hasMore;
          hasMoreOverall = hasMoreOverall || context.hasMore;
        } else {
          // Schedule fetch for non-cached data
          const requestBody = {
            ...config.request_body,
            offset: context.offset,
            limit: context.limit,
          };
          batch.POST(config.url, JSON.stringify(requestBody), REQUEST_HEADERS, config.auth ?? false);
          sourcesToFetch.push({ sourceId, context, cacheKey });
        }
      }

      // Fetch new data
      let responses = [];
      if (sourcesToFetch.length > 0) {
        responses = batch.execute();
        if (responses.length !== sourcesToFetch.length) {
          throw new ScriptException("Batch response mismatch");
        }
      }

      // Process responses
      for (let i = 0; i < sourcesToFetch.length; i++) {
        const { sourceId, context, cacheKey } = sourcesToFetch[i];
        const res = responses[i];

        if (!res.isOk) {
          throw new ScriptException(`Request failed [${context.config.url}] (${res.code})`);
        }

        const responseBody = JSON.parse(res.body);
        const config = context.config;

        // Update total if needed
        if (!config.total && config.total_property) {
          const total = responseBody[config.total_property];
          if (!isNaN(total)) config.total = total;
        }

        // Transform videos
        const transform = config.transform || (v => v);
        const videos = responseBody[config.root].map(transform);

        // Filter duplicates and update global tracking
        const filteredVideos = [];
        for (const video of videos) {
          if (!newGlobalSeenVideoIds.has(video.id)) {
            filteredVideos.push(video);
            newGlobalSeenVideoIds.add(video.id); // Mark as seen globally
          }
        }

        // Update context
        context.offset += context.limit;
        const hasMore = filteredVideos.length > 0 && (
          (filteredVideos.length * (context.offset / context.limit) < config.total) ||
          filteredVideos.length >= context.limit
        );
        context.hasMore = hasMore;
        hasMoreOverall = hasMoreOverall || hasMore;

        allNewVideos.push(...filteredVideos);

        // Update the cache with new data and TTL
        if (_settings.cacheChannelContent) {
          state.channelContent[cacheKey] = { videos, hasMore };
          const ttlMinutes = CHANNEL_CONTENT_TTL_OPTIONS[_settings.cacheChannelContentTimeToLiveIndex];
          state.channelContentTimeToLive[cacheKey] = Date.now() + 1000 * 60 * ttlMinutes;
        }
      }

      // Create new pager with updated state
      return new MultiSourceVideoPager({
        videos: allNewVideos,
        hasMore: hasMoreOverall,
        contexts: newContexts,
        currentSources: newCurrentSources,
        globalSeenVideoIds: newGlobalSeenVideoIds, // Pass updated tracking
      });
    }
  }

  // Initialize and add sources
  const pager = new MultiSourceVideoPager();
  sourcesConfig.forEach(config => pager.addSource(config));
  return pager;
}

function trimEndSlash(str) {
  return str.replace(/\/$/, "")
}

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
      new PlatformID(PLATFORM, c.creator ?? '', _config.id),
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
  let parts = time.split(':').map(part => parseInt(part, 10));

  let totalSeconds = 0;

  // Handle different time formats based on the number of parts
  if (parts.length === 3) {
    // Format is hh:mm:ss
    let hours = parts[0];
    let minutes = parts[1];
    let seconds = parts[2];
    totalSeconds = (hours * 3600) + (minutes * 60) + seconds;
  } else if (parts.length === 2) {
    // Format is mm:ss
    let minutes = parts[0];
    let seconds = parts[1];
    totalSeconds = (minutes * 60) + seconds;
  } else {
    // Invalid format, return 0
    return 0;
  }

  
  return totalSeconds;
}

// From niconico plugin
function dateToUnixSeconds(date) {
  if (!date) {
    return null;
  }

  return Math.round(Date.parse(date) / 1000);
}

function extractVideoIDFromUrl(url) {
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
function batchRequest(requests, options = { parseBody:false }) {
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

  const responses = batch.execute();

  if(!options.parseBody) {
    return responses;
  }
  else {
    return responses.map((response) => {
      return {
        isOk: response.isOk,
        code: response.code,
        body: JSON.parse(response.body),
      };
    });
  }
}

function BitchuteVideoToPlatformVideo(v) {
  const videoUrl = `${URL_WEB_BASE_URL}${v.video_url}`;

  return new PlatformVideo({
    id:
      v.video_id && new PlatformID(PLATFORM, v.video_id, _config.id, PLATFORM_CLAIMTYPE),
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
        v.channel?.channel_id ?? '',
        _config.id,
        PLATFORM_CLAIMTYPE,
      ),
      v.channel?.channel_name ?? '',
      `${URL_WEB_BASE_URL}${v.channel?.channel_url ?? ''}`,
      v.channel?.thumbnail_url ?? '',
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

function extractProfileId(url) {
  // Define the regex pattern to match the channel ID, allowing alphanumeric, underscores, hyphens, and optional trailing slash
  const regex = /\/profile\/([A-Za-z0-9_\-]+)\/?/;

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

  const res = http.POST(URL_API_VIDEO_COMMENTS_AUTH, body, REQUEST_HEADERS, false);

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

  const response = http.GET(URL_WEB_SUBSCRIPTIONS_OLD, {}, true);

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

  const response = http.GET(URL_WEB_PLAYLISTS_OLD, {}, true);

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
  ).map((e) => `${URL_WEB_BASE_URL_OLD}${trimEndSlash(e.getAttribute('href'))}&${IS_PRIVATE_SUFIX}`);

  return playlists;
};

source.isPlaylistUrl = function (url) {
  return BITCHUTE_PLAYLIST_URL_REGEX.test(url) || URl_WEB_PLAYLIST_BY_QUERY_REGEX.test(url);
};

source.getPlaylist = function (url) {

  const isPrivate = IS_PRIVATE_REGEX.test(url);

  const isSystemGeneratedPlaylist = BITCHUTE_PLAYLIST_PRIVATE_URL_REGEX.test(url);

  if (isPrivate && !bridge.isLoggedIn()) {
    throw new LoginRequiredException('Login to import Subscriptions');
  }
  const playlist_id = extractPlaylistId(url) || extractPlaylistIdFromQuery(url);


  let playlistInfo;
  let channel = {};
  let playlistName = playlist_id;

  if(!isSystemGeneratedPlaylist) {

    const playlistInfoResponse = http.POST('https://api.bitchute.com/api/beta/playlist', JSON.stringify({ playlist_id }) , REQUEST_HEADERS, true);

    if(playlistInfoResponse.isOk) {
      playlistInfo = JSON.parse(playlistInfoResponse.body);

      playlistName = playlistInfo?.playlist_name || playlist_id;
      
      if(playlistInfo.profile_id) {
              
        channel = {
          channel_id: playlistInfo.profile_id,
          channel_name: playlistInfo.profile_name,
          channel_url: `${URL_WEB_BASE_URL}/profile/${playlistInfo.profile_id}`,
          thumbnail_url: playlistInfo.thumbnail_url,
        };
      } else {
        channel = {
          channel_id: playlistInfo.channel_id,
          channel_name: playlistInfo.channel_name,
          channel_url: `${URL_WEB_BASE_URL}/channel/${playlistInfo.channel_id}`,
          thumbnail_url: playlistInfo.thumbnail_url,
        };
      }
    }
  }

  const query = {
    cacheKey: 'playlist_id',
    cacheValue: playlist_id,
    url: 'https://api.bitchute.com/api/beta/playlist/videos',
    root: 'videos',
    total: playlistInfo?.video_count ?? -1,
    auth: isPrivate,
    request_body: {
      offset: 0,
      limit: 50,
      playlist_id: playlist_id,
    },
    transform: (v) => {
      if(!isSystemGeneratedPlaylist && playlistInfo?.profile_id) {
        v.channel = channel;
      }

      return BitchuteVideoToPlatformVideo(v.video);
    },
  };
  
  let contentPager = createMultiSourcePager([query]).nextPage();

  return new PlatformPlaylistDetails({
    url: url,
    id: new PlatformID(PLATFORM, channel.channel_id, _config.id, PLATFORM_CLAIMTYPE),
    author: new PlatformAuthorLink(
      new PlatformID(PLATFORM, '', _config.id, PLATFORM_CLAIMTYPE),
      channel.channel_name,// author name
      channel.channel_url,// author url
    ),
    name: playlistName,// playlist name
    thumbnail: '',
    videoCount: playlistInfo?.video_count ?? -1,
    contents: contentPager,
  });
};

function extractPlaylistId(url) {
  const regex = /^https:\/\/(old|www)\.bitchute\.com\/playlist\/(favorites|watch-later|recently-viewed|[a-zA-Z0-9]+)(?:[?&][^#]*)?$/;
  const match = url.match(regex);

  return match ? match[2] : null;
}

function extractPlaylistIdFromQuery(url) {
  const regex = /^https:\/\/www\.bitchute\.com\/video\/playlist\?playlistId=([a-zA-Z0-9]+)$/;
  const match = url.match(regex);
  
  return match ? match[1] : null;
}

source.getContentRecommendations = (url, initialData) => {
  const selectedRecommendedContent =
    RECOMMENDED_CONTEXT_OPTIONS[_settings.RecommendedContentIndex];
  const isMoreFromSameChannel =
    selectedRecommendedContent === 'More from same channel';
  const isRelated = selectedRecommendedContent === 'Related';
  const isForYou = selectedRecommendedContent === 'For you';
  const isRecentUploads = selectedRecommendedContent === 'Recent Uploads';

  let requestUrl = '';
  let body = {};

  const videoId = extractVideoIDFromUrl(url);

  if (!initialData) {
    const [videoDetailsResponse] = batchRequest([
      {
        url: URL_API_VIDEO_INFO,
        method: 'POST',
        headers: REQUEST_HEADERS,
        body: JSON.stringify({ video_id: videoId }),
      },
    ]);

    if (!videoDetailsResponse.isOk) {
      throw new ScriptException(
        `Failed request videoDetailsResponse (${videoDetailsResponse.code})`,
      );
    }

    initialData = JSON.parse(videoDetailsResponse.body);
  }

  if (isMoreFromSameChannel) {
    body = { channel_id: initialData.channel.channel_id, offset: 0, limit: 50 };
    requestUrl = URL_API_CHANNEL_VIDEOS;
  } else if (isRelated || isRecentUploads) { //currently they have same beahvior as "Related"
    body = {
      selection: 'popular',
      offset: 0,
      limit: 10,
      category_id: initialData.category_id,
    };
    requestUrl = URL_API_VIDEOS_BETA;
  } else if (isForYou) {
    body = { selection: 'popular', offset: 0, limit: 10, category_id: 'news' };
    requestUrl = URL_API_VIDEOS_BETA;
  }

  const res = http.POST(
    requestUrl,
    JSON.stringify(body),
    REQUEST_HEADERS,
    false,
  );

  if (!res.isOk) {
    throw new ScriptException(`Failed request [${requestUrl}] (${res.code})`);
  }

  let videos = JSON.parse(res.body).videos;

  if (isMoreFromSameChannel) {
    const channel = initialData?.channel ?? {
      channel_id: '',
      channel_name: '',
      channel_url: '',
      thumbnail_url: '',
    };

    videos = videos.map((v) => {
      v.channel = channel;
      return v;
    });
  }

  const platformVideos = videos
    .filter((v) => v.video_id !== videoId) // remove current video from recommendations
    .map(BitchuteVideoToPlatformVideo);

  return new VideoPager(platformVideos ?? [], false);
};

log('LOADED');

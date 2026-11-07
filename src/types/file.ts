export type UploadContentType =
  // Images
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/gif'
  | 'image/tiff'
  | 'image/geotiff'

  // Video
  | 'video/mp4'
  | 'video/webm'
  | 'video/quicktime'

  // Audio
  | 'audio/webm'
  | 'audio/ogg'
  | 'audio/mp4'
  | 'audio/mpeg'
  | 'audio/webm; codecs=opus' // for safari
  | 'audio/webm;codecs=opus'
  | 'audio/ogg;codecs=opus'
  | 'audio/m4a'

  // PDF
  | 'application/pdf'

  // Microsoft Word
  | 'application/msword'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

  // Microsoft Excel
  | 'application/vnd.ms-excel'
  | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

  // Microsoft PowerPoint
  | 'application/vnd.ms-powerpoint'
  | 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

  // OpenDocument
  | 'application/vnd.oasis.opendocument.text'
  | 'application/vnd.oasis.opendocument.spreadsheet'
  | 'application/vnd.oasis.opendocument.presentation'

  // GIS
  | 'application/vnd.google-earth.kml+xml' // .kml
  | 'application/vnd.google-earth.kmz' // .kmz
  | 'application/vnd.shp' // .shp
  | 'application/vnd.shx' // .shx
  | 'application/vnd.dbf' // .dbf
  | 'application/x-dbf'
  | 'application/geo+json' // .geojson
  | 'application/vnd.geo+json'
  | 'application/gpx+xml' // .gpx
  | 'application/x-gpx+xml'
  | 'application/x-mapinfo-tab' // .tab

  // Compressed files
  | 'application/zip' // .zip
  | 'application/x-zip-compressed'
  | 'application/vnd.rar' // .rar
  | 'application/x-rar-compressed'
  | 'application/x-rar'
  | 'application/x-tar' // .tar

  // Installers
  | 'application/vnd.android.package-archive' // .apk
  | 'application/x-apple-diskimage' // .dmg

  // 3D models
  | 'model/vnd.collada+xml' // .dae
  | 'application/vnd.google.sketchup' // .skp
  | 'application/x-sketchup';

export type UploadFile = {
  contentType: UploadContentType;
  size: number;
  fileName: string;
};

export type UploadDto = {
  files: UploadFile[];
};

export type FileAttachment = {
  id: string;
  fileName: string;
  size: number;
  storageKey: string;
  contentType: string;
};

export type PresignedUrl = {
  key: string;
  url: string;
};

export type DownloadDto = {
  attachmentId: string;
};

update storage.buckets
set
  file_size_limit = 3145728,
  allowed_mime_types = array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/svg+xml'
  ]
where id = 'branding-assets';

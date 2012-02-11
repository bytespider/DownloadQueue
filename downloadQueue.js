function FileDescriptor(file_path)
{
    
}

function fireProgress(file_descriptor, event)
{ 
    Ti.fireEvent("downloadqueue:progress", file_descriptor);
    if (typeof file_descriptor.progress == "function")
    {
        file_descriptor.progress.call(this, event);                        
    }
}

function fireComplete(file_descriptor, event)
{
    Ti.fireEvent("downloadqueue:complete", file_descriptor);
    if (typeof file_descriptor.complete == "function")
    {
        file_descriptor.complete.call(file_descriptor, event);                        
    }
}

function fireQueueComplete(http_connections)
{
    if (http_connections == 0)
    {
        Ti.fireEvent("downloadqueue:queuecomplete");
    }
}

var queue = [], http_connections = 0;

var downloads = JSON.parse(Ti.App.Properties.getString("downloadQueue")) || {};

exports.maxConnections = 4;
exports.downloadDirectory = Ti.Filesystem.applicationDataDirectory;
exports.timeout = 30000;

exports.add = function (file_descriptor)
{
    queue.push(file_descriptor);
};

exports.remove = function (index)
{
    queue = queue.splice(index, 1);
};

exports.clear = function ()
{
    queue = [];
};

exports.process = function ()
{
    var item, dq = this;
    while (http_connections < dq.maxConnections && (item = queue.shift()))
    {
        http_connections++;
        
        var directory = Ti.Filesystem.getFile(dq.downloadDirectory);
        if (!directory.exists())
        {
            directory.createDirectory();
        }
        
        var hash = Ti.Utils.md5HexDigest(dq.downloadDirectory + item.filename);
        if (!(hash in downloads))
        {
            downloads[hash] = {
                path: dq.downloadDirectory + item.filename,
                filename: item.filename,
                downloadTotal: 0
            };
        }
        Ti.App.Properties.setString("downloadQueue", JSON.stringify(downloads));
        
        var file = Ti.Filesystem.getFile(dq.downloadDirectory + item.filename);
        if (file.exists() && (downloads[hash].downloadTotal > 0 && file.size == downloads[hash].downloadTotal))
        {
            fireProgress.call(dq, item, {progress: 1});
            fireComplete.call(dq, item, null);
            fireQueueComplete.call(dq, queue.length);
            continue;
        } 
            
        file.createFile();
        
        item.file = file;
        item.hash = hash;
        
        var connection = Ti.Network.createHTTPClient({
            timeout: dq.timeout,

            ondatastream: (function (file_descriptor)
            {
                var session_pointer = 0;
                var outstream = file_descriptor.file.open(Titanium.Filesystem.MODE_APPEND);
                
                return function (event)
                {
                    var content_length = this.getResponseHeader("Content-Length"),
                        hash = file_descriptor.hash,
                        file = file_descriptor.file,
                        downloaded_size = this.responseData.length;
                    
                    // Set the download total
                    if (downloads[hash].downloadTotal == 0 && content_length > 0)
                    {
                        Ti.API.log("content-size: " + content_length);
                        
                        downloads[hash].downloadTotal = content_length;
                        Ti.App.Properties.setString("downloadQueue", JSON.stringify(downloads));
                    }
                    
                    
                    var buffer = Ti.createBuffer({length: downloaded_size});
                    var instream = Titanium.Stream.createStream({mode: Titanium.Stream.MODE_READ, source: this.responseData});
                    
                    // Read and write chunks.
                    instream.read(buffer);
                    outstream.write(buffer, session_pointer, downloaded_size);
                    
                    instream.close();
                    
                    session_pointer = downloaded_size;
                    
                    // override progress using file size
                    Ti.API.log("session progress: " + event.progress);
                    Ti.API.log("file progress: " + (file.size / downloads[hash].downloadTotal));
                    Ti.API.log("file size: "  + file.size);
                    
                    event.progress = file.size / downloads[hash].downloadTotal;

                    fireProgress.call(dq, file_descriptor, event);
                    
                    // clean up the input stream & buffer
                    instream.close();
                    instream = null;
                    buffer = null;
                    
                    // clean up the output stream
                    if (event.progress == 1)
                    {
                        outstream.close();
                        outstream = null;
                    }
                }
            })(item),

            onload: (function (file_descriptor)
            {
                return function (event)
                {
                    // This is most likely unnessasry as we've already written the 
                    // entire contents by this point.
                    /*
                    file_descriptor.file.write(this.responsData);
                    */
                    
                    fireComplete.call(dq, file_descriptor, event);
                    http_connections--;

                    if (queue.length > 0)
                    {
                        dq.process();
                    }

                    fireQueueComplete(http_connections, dq);
                }
            })(item),

            onerror: function (event)
            {
                httpConnections--;
                Ti.API.error("Failed to download");
            }
        });
        
        connection.open("GET", item.url);
        
        if (file.size > 0 && file.size != downloads[hash].downloadTotal)
        {
            connection.setRequestHeader("Range", "bytes=" + file.size + "-");
        }
        
        connection.send();
    }
};
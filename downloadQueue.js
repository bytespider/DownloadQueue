var queue = [], httpConnections = 0;

var downloads = JSON.parse(Ti.App.Properties.getString("downloadQueue")) || {};

exports.maxConnections = 4;
exports.downloadDirectory = Ti.Filesystem.applicationDataDirectory;
exports.timeout = 30000;

exports.add = function (fileDescriptor)
{
    queue.push(fileDescriptor);
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
    while (httpConnections < dq.maxConnections && (item = queue.shift()))
    {
        httpConnections++;
        
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
                completeSize: 0
            };
        }
        Ti.App.Properties.setString("downloadQueue", JSON.stringify(downloads));
        
        var file = Ti.Filesystem.getFile(dq.downloadDirectory + item.filename);
        if (file.exists() && (downloads[hash].completeSize > 0 && file.size == downloads[hash].completeSize))
        {
            if (typeof item.progress == "function")
            {
                item.progress({progress: 1});                        
            }
            
            Ti.fireEvent("downloadqueue:complete", item);
            item.complete(null);
            
            if (queue.length == 0)
            {
                Ti.fireEvent("downloadqueue:queuecomplete", dq);
            }
            continue;
        } 
        else
        {
            file.createFile();
        }
        item.file = file;
        item.hash = hash;
        
        var connection = Ti.Network.createHTTPClient({
            timeout: dq.timeout,
            //file: file,

            ondatastream: (function (fileDescriptor)
            {
                var sessionPointer = 0;
                var outstream = fileDescriptor.file.open(Titanium.Filesystem.MODE_APPEND);
                
                return function (event)
                {
                    var content_length = this.getResponseHeader("Content-Length"),
                        hash = fileDescriptor.hash,
                        file = fileDescriptor.file,
                        downloadedSize = this.responseData.length;
                    
                    if (downloads[hash].completeSize == 0 && content_length > 0)
                    {
                        downloads[hash].completeSize = content_length;
                        Ti.App.Properties.setString("downloadQueue", JSON.stringify(downloads));
                    }
                    
                    Ti.API.log("content-size: " + downloads[hash].completeSize);
                    
                    var buffer = Ti.createBuffer({length: downloadedSize});
                    var instream = Titanium.Stream.createStream({mode: Titanium.Stream.MODE_READ, source: this.responseData});
                    
                    
                    // Read and write chunks.
                    instream.read(buffer);
                    outstream.write(buffer, sessionPointer, downloadedSize);
                    
                    instream.close();
                    
                    sessionPointer = downloadedSize;
                    Ti.API.log("session pointer: " + sessionPointer);
                    
                    // override progress using file size
                    Ti.API.log(event.progress);
                    Ti.API.log(file.size / downloads[hash].completeSize);
                    Ti.API.log("file size: "  + file.size);
                    
                    event.progress = file.size / downloads[hash].completeSize;

                    if (typeof fileDescriptor.progress == "function")
                    {
                        fileDescriptor.progress(event);                        
                    }
                    
                    if (event.progress == 1)
                    {
                        outstream.close();
                    }
                }
            })(item),

            onload: (function (fileDescriptor)
            {
                return function (event)
                {
                    fileDescriptor.file.write(this.responsData);
                    
                    Ti.fireEvent("downloadqueue:complete", fileDescriptor);
                    fileDescriptor.complete(event);
                    httpConnections--;

                    if (dq.queue.length > 0)
                    {
                        dq.process();
                    }
                    else if (httpConnections == 0)
                    {
                        Ti.fireEvent("downloadqueue:queuecomplete", dq);
                    }

                }
            })(item),

            onerror: function (event)
            {
                httpConnections--;
                Ti.API.error("Failed to download");
            }
        });
        
        connection.open("GET", item.url);
        
        if (file.size > 0 && file.size != downloads[hash].completeSize)
        {
            connection.setRequestHeader("Range", "bytes=" + file.size + "-");
        }
        
        connection.send();
    }
};
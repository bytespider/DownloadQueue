function DownloadQueue(options)
{
    this.queue = [];
    this.httpConnections = 0;

    if (options)
    {
        this.maxConnections = options.maxConnections || 4;
        this.downloadDirectory = options.downloadDirectory || Ti.Filesystem.tempDirectory;
        this.timeout = options.timeout || 30000;
    }
}
DownloadQueue.prototype.maxConnections = 4;
DownloadQueue.prototype.downloadDirectory = Ti.Filesystem.tempDirectory;
DownloadQueue.prototype.queue = [];

DownloadQueue.prototype.add = function (fileDescriptor)
{
    this.queue.push(fileDescriptor);
};
DownloadQueue.prototype.clear = function ()
{
    this.queue = [];
    Ti.fireEvent("downloadqueue:queuecleared", this);
};

DownloadQueue.prototype.process = function ()
{
    var dq = this;
    var dataDirectory = dq.downloadDirectory;

    dq.httpConnections = dq.httpConnections || 0;

    var maxConnections = dq.maxConnections, item;
    while (dq.httpConnections < maxConnections && (item = dq.queue.shift()))
    {
        dq.httpConnections++;

        var file = Ti.Filesystem.getFile(dataDirectory + item.filename);
        item.file = file;
        
        
        Ti.API.log(file.name + " [start]: " + file.size);
        
        var conenction = Ti.Network.createHTTPClient({
            timeout: dq.timeout,
            
            ondatastream: (function (fileDescriptor)
            {
                return function (event)
                {
                    Ti.API.log(fileDescriptor.file.name + ": " + fileDescriptor.file.size);
                    
                    fileDescriptor.file.write(this.responseData, true);
                    fileDescriptor.progress(event);
                }
            })(item),
            
            onload: (function (fileDescriptor)
            {
                return function (event)
                {
                    Ti.fireEvent("downloadqueue:complete", fileDescriptor);
                    dq.httpConnections--;
    
                    if (dq.queue.length > 0)
                    {
                        dq.process();
                    }
                    else if (dq.httpConnections == 0)
                    {
                        Ti.fireEvent("downloadqueue:queuecomplete", dq);
                    }
    
                }
            })(item),
            
            onerror: function (event)
            {
                dq.httpConnections--;
                Ti.API.error("Failed to download");
            }
        });
        
        conenction.open("GET", item.url);
        conenction.setRequestHeader("Range", "bytes " + (file.size + 1) + "-");
        
        conenction.send();
    }
};

exports.createDownloadQueue = function (options)
{
    return new DownloadQueue(options);
};

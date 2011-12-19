function DownloadQueue(options)
{
    this.queue = [];

    if (options)
    {
        this.maxConnections = options.maxConnections || 4;
        this.downloadDirectory = options.downloadDirectory || Ti.Filesystem.tempDirectory;
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

    var httpConnections = this.httpConnections, queue = this.queue, maxConnections = this.maxConnections, item;
    while (httpConnections < maxConnections && (item = queue.shift()))
    {
        dq.httpConnections++;

        var filePath = dataDirectory + item.filename;
        var conenction = Ti.Network.createHTTPClient({
            file: filePath,
            ondatastream: (function (fileDescriptor)
            {
                return function (event)
                {
                    fileDescriptor.filePath = filePath;
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
                Ti.API.error("Fail to download");
            }
        });

        conenction.open("GET", item.url);
        conenction.send();
    }
};

exports.createDownloadQueue = function (options)
{
    return new DownloadQueue(options);
};

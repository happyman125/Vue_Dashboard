import axios from 'axios';

const removeDatasetDuplicates = dataset => dataset.filter((data, index, array) => (
  array.map(d => d.t).lastIndexOf(data.t) === index
));

export default class CloudWatchService {
  constructor({ periodMinutes = 5, backfillMinutes = 120 } = {}, metrics) {
    this.metrics = metrics;
    this.periodMinutes = periodMinutes;
    this.backfillMinutes = backfillMinutes;
    this.maxDatapoints = Math.ceil(backfillMinutes / periodMinutes);
    this.updatedAt = null;
    this.datasets = [];
  }

  async update() {
    const options = {
      url: process.env.API_ENDPOINT,
      method: 'post',
      headers: {
        'X-Api-Key': process.env.API_KEY,
      },
      data: {
        start: this.updatedAt || new Date(Date.now() - (this.backfillMinutes * 60 * 1000)),
        periodMinutes: this.periodMinutes,
        metrics: this.metrics,
      },
    };
    try {
      const response = await axios.request(options);
      this.updatedAt = new Date(); // Doesn't reach if request failed
      this.appendData(response.data);
    } catch (error) { } // eslint-disable-line no-empty
    return this.data;
  }

  appendData(data) {
    data.forEach((newDataset) => {
      const oldIndex = this.datasets.findIndex(oldDataset => oldDataset.id === newDataset.id);
      if (oldIndex >= 0) { // Found
        const oldData = this.datasets[oldIndex].data;
        this.datasets[oldIndex].data = oldData.concat(newDataset.data);
      } else { // New dataset
        this.datasets.push(this.tagAndLabel(newDataset));
      }
    });
    this.datasets = this.datasets.map(d => Object.assign(d, {
      data: removeDatasetDuplicates(d.data).slice(this.maxDatapoints * -1), // Ensure moving window
    }));
  }

  tagAndLabel(data) {
    // Add tags and labels from metrics objects
    const metric = this.metrics.find(m => m.id === data.id);
    return typeof metric === 'undefined' ? data : Object.assign(data, {
      tags: metric.tags,
      label: metric.label,
    });
  }
}

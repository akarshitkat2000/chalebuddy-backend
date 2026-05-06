/**
 * APIFeatures — chainable query builder for filtering, sorting, field limiting, pagination
 * Usage: new APIFeatures(Model.find(), req.query).filter().sort().limitFields().paginate()
 */
class APIFeatures {
  constructor(query, queryString) {
    this.query = query;
    this.queryString = queryString;
  }

  filter() {
    const qObj = { ...this.queryString };
    ["page", "sort", "limit", "fields", "search"].forEach((f) => delete qObj[f]);

    // Advanced filters: gte, gt, lte, lt
    let qStr = JSON.stringify(qObj).replace(/\b(gte|gt|lte|lt)\b/g, (m) => `$${m}`);
    this.query = this.query.find(JSON.parse(qStr));
    return this;
  }

  search(fields = []) {
    if (this.queryString.search && fields.length) {
      const regex = new RegExp(this.queryString.search, "i");
      const conditions = fields.map((f) => ({ [f]: regex }));
      this.query = this.query.find({ $or: conditions });
    }
    return this;
  }

  sort() {
    if (this.queryString.sort) {
      const sortBy = this.queryString.sort.split(",").join(" ");
      this.query = this.query.sort(sortBy);
    } else {
      this.query = this.query.sort("-createdAt");
    }
    return this;
  }

  limitFields() {
    if (this.queryString.fields) {
      const fields = this.queryString.fields.split(",").join(" ");
      this.query = this.query.select(fields);
    } else {
      this.query = this.query.select("-__v");
    }
    return this;
  }

  paginate() {
    const page  = Math.max(1, parseInt(this.queryString.page, 10)  || 1);
    const limit = Math.min(100, parseInt(this.queryString.limit, 10) || 20);
    const skip  = (page - 1) * limit;
    this.query  = this.query.skip(skip).limit(limit);
    this.page   = page;
    this.limit  = limit;
    return this;
  }
}

module.exports = APIFeatures;

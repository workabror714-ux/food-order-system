const mongoose = require("mongoose");

const IntegrationStateSchema = new mongoose.Schema({
  provider: { type: String, required: true },
  resource: { type: String, required: true },
  restaurantId: { type: String, default: "" },
  status: {
    type: String,
    enum: ["idle", "running", "success", "failed"],
    default: "idle",
  },
  lastSourceChange: { type: String, default: "" },
  lastStartedAt: { type: Date, default: null },
  lastSyncedAt: { type: Date, default: null },
  lastError: { type: String, default: "" },
  summary: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true });

IntegrationStateSchema.index(
  { provider: 1, resource: 1, restaurantId: 1 },
  { unique: true }
);

module.exports = mongoose.model("IntegrationState", IntegrationStateSchema);

const commonFields = (schema) => {
  // Add fields to the schema
  schema.add({
    isActive: {
      type: Boolean,
      default: true,
    },
    isDelete: {
      type: Boolean,
      default: false,
    },
  });

  // Add timestamps if not already enabled
  if (!schema.options.timestamps) {
    schema.set('timestamps', true);
  }
};

module.exports = commonFields;

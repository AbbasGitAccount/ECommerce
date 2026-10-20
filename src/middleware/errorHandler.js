const errorHandler = (err, _req, res, _next) => {
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 500
    ? err.status
    : 500;
  const invalidJson = err.type === "entity.parse.failed";

  if (status === 500) console.error(err.stack ?? err);

  return res.status(status).json({
    status,
    message: invalidJson
      ? "Request body must contain valid JSON"
      : status === 500
        ? "Something went wrong"
        : err.message,
  });
};

export default errorHandler;


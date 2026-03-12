const StarRating = ({ value = 0, max = 5, size = "md" }) => {
  const safeValue = Math.max(0, Math.min(Number(value) || 0, max));
  const stars = Array.from({ length: max }, (_, index) => {
    const starValue = index + 1;
    return starValue <= Math.round(safeValue);
  });

  return (
    <span className={`stars stars--${size}`} aria-label={`Rating ${safeValue} de ${max}`}>
      {stars.map((filled, index) => (
        <span key={index} className={filled ? "star star--filled" : "star"}>
          ★
        </span>
      ))}
      <span className="stars__value">{safeValue.toFixed(1)}</span>
    </span>
  );
};

export default StarRating;

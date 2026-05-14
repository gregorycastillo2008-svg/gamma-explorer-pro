import { useEffect } from "react";

const Index = () => {
  useEffect(() => {
    window.location.replace("/landing.html");
  }, []);
  return null;
};

export default Index;

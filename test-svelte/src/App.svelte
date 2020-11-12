<script>
  export let name;
</script>

<style lang="jazz">
  @use './config.js' import theme;

  .app {
    color: theme('colors.blue');
  }
</style>

<h1 class="%app">Hello {name}!</h1>

/**
 * Configure your Gatsby site with this file.
 *
 * See: https://www.gatsbyjs.org/docs/gatsby-config/
 */
module.exports = {
  /* Your site config here */
  plugins: [
    {
      resolve: 'gatsby-source-filesystem',
      options: {
        name: `MDXPages`,
        path: `src/pages/`,
      },
    },
    'gatsby-plugin-mdx',
    'gatsby-plugin-unc',
    'gatsby-plugin-postcss',
    'gatsby-plugin-typescript',
  ],
};

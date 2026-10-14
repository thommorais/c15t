package main

import (
	"bufio"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
	"github.com/spf13/cobra"

	"thom/api"
	"thom/core/apikey"
	_ "thom/migrations"
)

func main() {
	app := pocketbase.New()

	isGoRun := strings.HasPrefix(os.Args[0], os.TempDir())

	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		Automigrate: isGoRun,
	})

	app.RootCmd.AddCommand(newAPIKeyCmd(app))
	app.RootCmd.AddCommand(newOperatorCmd(app))

	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		cfg, err := api.ConfigFromEnv(os.Getenv)
		if err != nil {
			return err
		}

		warnings, err := api.ValidateConfig(cfg)
		if err != nil {
			return err
		}
		for _, w := range warnings {
			app.Logger().Warn(w)
		}
		api.Register(app, se, cfg)
		return se.Next()
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}

func newAPIKeyCmd(app core.App) *cobra.Command {
	var name, env, scope, origins string

	cmd := &cobra.Command{
		Use:   "apikey:create",
		Short: "Create an API key for this instance",
		RunE: func(_ *cobra.Command, _ []string) error {
			keyEnv := apikey.Env(env)
			if keyEnv != apikey.EnvLive && keyEnv != apikey.EnvTest {
				return fmt.Errorf("--env must be live or test")
			}

			keyScope := apikey.Scope(scope)
			if keyScope != apikey.ScopePublishable && keyScope != apikey.ScopeSecret {
				return fmt.Errorf("--scope must be publishable or secret")
			}

			if err := app.Bootstrap(); err != nil {
				return err
			}

			key, err := apikey.Generate(keyEnv, keyScope)
			if err != nil {
				return err
			}

			collection, err := app.FindCollectionByNameOrId("apiKey")
			if err != nil {
				return err
			}

			record := core.NewRecord(collection)
			record.Set("name", name)
			record.Set("keyHash", key.Hash)
			record.Set("env", string(keyEnv))
			record.Set("scope", string(keyScope))
			record.Set("origins", origins)
			record.Set("revoked", false)

			if err := app.Save(record); err != nil {
				return err
			}

			fmt.Printf("%s\n", key.Secret)
			return nil
		},
	}

	cmd.Flags().StringVar(&name, "name", "", "key label")
	cmd.Flags().StringVar(&env, "env", "live", "live or test")
	cmd.Flags().StringVar(&scope, "scope", "secret", "publishable or secret")
	cmd.Flags().StringVar(&origins, "origins", "", "comma separated origins a publishable key may be used from")

	return cmd
}

// newOperatorCmd reads the password from the first line of stdin so it stays
// out of shell history and the process list.
func newOperatorCmd(app core.App) *cobra.Command {
	var email, tenant string

	cmd := &cobra.Command{
		Use:   "operator:create",
		Short: "Create a dashboard operator; the password is read from stdin",
		RunE: func(cmd *cobra.Command, _ []string) error {
			line, err := bufio.NewReader(cmd.InOrStdin()).ReadString('\n')
			if err != nil && line == "" {
				return fmt.Errorf("pipe the password on stdin")
			}
			password := strings.TrimRight(line, "\r\n")

			if err := app.Bootstrap(); err != nil {
				return err
			}
			if err := api.CreateOperator(app, email, password, tenant); err != nil {
				return err
			}

			fmt.Printf("operator %s created for tenant %q\n", email, tenant)
			return nil
		},
	}

	cmd.Flags().StringVar(&email, "email", "", "operator email")
	cmd.Flags().StringVar(&tenant, "tenant", os.Getenv("C15T_TENANT_ID"), "tenant the operator reads; defaults to C15T_TENANT_ID")

	return cmd
}
